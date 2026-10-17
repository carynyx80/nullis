// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWrappedEther is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
interface IRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
    function WETH9() external view returns (address);
    function factory() external view returns (address);
}

/// @notice Public beta account ledger. No privacy, admin, fees, upgrades or external execution hooks.
/// @dev Each wallet can spend only its own credited balances. Only ETH/WETH/USDG are supported.
contract NullispadPublicAccount is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable wrappedEther;
    address public immutable dollar;
    IRouter02 public immutable router;
    mapping(address owner => mapping(address asset => uint256)) public balances;
    error UnsupportedAsset();
    error InvalidAmount();
    error InvalidConfiguration();
    error InsufficientBalance();
    error IncorrectAssetMovement();
    error Expired();
    error NativeTransferFailed();
    event Deposited(address indexed owner, address indexed asset, uint256 amount);
    event Withdrawn(address indexed owner, address indexed asset, uint256 amount);
    event Swapped(address indexed owner, address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut, uint24 fee);

    constructor(address weth, address usd, IRouter02 router_, address factory_) {
        if(weth == usd || weth.code.length == 0 || usd.code.length == 0 || address(router_).code.length == 0 || factory_.code.length == 0) revert InvalidConfiguration();
        if(router_.WETH9() != weth || router_.factory() != factory_) revert InvalidConfiguration();
        wrappedEther = weth; dollar = usd; router = router_;
    }
    receive() external payable { if(msg.sender != wrappedEther) revert UnsupportedAsset(); }
    function supported(address asset) public view returns(bool) { return asset == address(0) || asset == wrappedEther || asset == dollar; }
    function depositNative() external payable nonReentrant {
        if(msg.value == 0) revert InvalidAmount();
        balances[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender,address(0),msg.value);
    }
    function deposit(address asset, uint256 amount) external nonReentrant {
        if(!supported(asset) || asset == address(0)) revert UnsupportedAsset();
        if(amount == 0) revert InvalidAmount();
        IERC20 token = IERC20(asset);
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        uint256 afterBalance = token.balanceOf(address(this));
        if(afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert IncorrectAssetMovement();
        balances[msg.sender][asset] += amount;
        emit Deposited(msg.sender,asset,amount);
    }
    function withdraw(address asset, uint256 amount) external nonReentrant {
        if(!supported(asset)) revert UnsupportedAsset();
        debit(asset,amount);
        if(asset == address(0)) {
            (bool success,) = msg.sender.call{value:amount}("");
            if(!success) revert NativeTransferFailed();
        } else {
            IERC20 token = IERC20(asset);
            uint256 vaultBefore = token.balanceOf(address(this));
            uint256 recipientBefore = token.balanceOf(msg.sender);
            token.safeTransfer(msg.sender,amount);
            uint256 vaultAfter = token.balanceOf(address(this));
            uint256 recipientAfter = token.balanceOf(msg.sender);
            if(vaultAfter > vaultBefore || vaultBefore - vaultAfter != amount || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount) revert IncorrectAssetMovement();
        }
        emit Withdrawn(msg.sender,asset,amount);
    }
    function swap(address assetIn, address assetOut, uint24 fee, uint256 amountIn, uint256 minimumOut, uint256 deadline) external nonReentrant returns(uint256 amountOut) {
        if(!supported(assetIn) || !supported(assetOut) || assetIn == assetOut) revert UnsupportedAsset();
        if(deadline < block.timestamp || deadline > block.timestamp + 20 minutes) revert Expired();
        if(minimumOut == 0) revert InvalidAmount();
        debit(assetIn,amountIn);
        address tokenIn = assetIn == address(0) ? wrappedEther : assetIn;
        address tokenOut = assetOut == address(0) ? wrappedEther : assetOut;
        if(assetIn == address(0)) {
            uint256 wrappedBefore = IERC20(wrappedEther).balanceOf(address(this));
            IWrappedEther(wrappedEther).deposit{value:amountIn}();
            uint256 wrappedAfter = IERC20(wrappedEther).balanceOf(address(this));
            if(wrappedAfter < wrappedBefore || wrappedAfter - wrappedBefore != amountIn) revert IncorrectAssetMovement();
        }
        if(tokenIn == tokenOut) {
            amountOut = amountIn;
        } else {
            uint256 inputBefore = IERC20(tokenIn).balanceOf(address(this));
            uint256 outputBefore = IERC20(tokenOut).balanceOf(address(this));
            IERC20(tokenIn).forceApprove(address(router),amountIn);
            router.exactInputSingle(IRouter02.ExactInputSingleParams(tokenIn,tokenOut,fee,address(this),amountIn,minimumOut,0));
            IERC20(tokenIn).forceApprove(address(router),0);
            uint256 inputAfter = IERC20(tokenIn).balanceOf(address(this));
            uint256 outputAfter = IERC20(tokenOut).balanceOf(address(this));
            if(inputAfter > inputBefore || inputBefore - inputAfter != amountIn || outputAfter < outputBefore) revert IncorrectAssetMovement();
            amountOut = outputAfter - outputBefore;
        }
        if(amountOut < minimumOut) revert IncorrectAssetMovement();
        if(assetOut == address(0)) {
            uint256 nativeBefore = address(this).balance;
            uint256 wrappedBefore = IERC20(wrappedEther).balanceOf(address(this));
            IWrappedEther(wrappedEther).withdraw(amountOut);
            uint256 wrappedAfter = IERC20(wrappedEther).balanceOf(address(this));
            if(address(this).balance < nativeBefore || address(this).balance - nativeBefore != amountOut || wrappedAfter > wrappedBefore || wrappedBefore - wrappedAfter != amountOut) revert IncorrectAssetMovement();
        }
        balances[msg.sender][assetOut] += amountOut;
        emit Swapped(msg.sender,assetIn,assetOut,amountIn,amountOut,fee);
    }
    function debit(address asset, uint256 amount) private {
        if(amount == 0) revert InvalidAmount();
        if(balances[msg.sender][asset] < amount) revert InsufficientBalance();
        balances[msg.sender][asset] -= amount;
    }
}
