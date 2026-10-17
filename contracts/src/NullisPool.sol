// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;

import {Zeto_AnonEncNullifier} from "zeto/zeto_anon_enc_nullifier.sol";
import {IZetoInitializable} from "zeto/lib/interfaces/IZetoInitializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ZetoCommonStorage} from "zeto/lib/zeto_common.sol";

/// @notice Experimental adaptation. Not approved for mainnet funds.
/// @dev Atomic initialization permanently removes the owner used by inherited
///      UUPS authorization. There is no external mint route, even during setup.
contract NullisPool is Zeto_AnonEncNullifier {
    IERC20 public immutable backingAsset;
    bytes32 public immutable verifierConfiguration;
    uint8 private immutable assetDecimals;

    error InvalidConfiguration();
    error UnbackedMintDisabled();
    error IncorrectAssetMovement();
    error WithdrawalProofBindingRequired();
    error InvalidDepositShape();

    constructor(IERC20 asset, bytes32 configuration) {
        if (address(asset).code.length == 0 || configuration == bytes32(0)) revert InvalidConfiguration();
        backingAsset = asset;
        assetDecimals = IERC20Metadata(address(asset)).decimals();
        verifierConfiguration = configuration;
    }

    /// @dev Must be called atomically by the proxy constructor. The verifier
    ///      configuration is committed in the implementation constructor.
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address initialOwner,
        IZetoInitializable.VerifiersInfo calldata verifiers
    ) public override initializer {
        if (initialOwner != address(0) || keccak256(abi.encode(verifiers)) != verifierConfiguration) revert InvalidConfiguration();
        if (address(verifiers.verifier).code.length == 0 || address(verifiers.depositVerifier).code.length == 0 || address(verifiers.withdrawVerifier).code.length == 0) revert InvalidConfiguration();
        __ZetoAnonEncNullifier_init(name_, symbol_, msg.sender, verifiers);
        setERC20(backingAsset);
        // No transaction can be interleaved between configuration and this step.
        // Ownable2Step also clears any pending owner here.
        _transferOwnership(address(0));
    }

    function mint(uint256[] calldata, bytes calldata) public pure override {
        revert UnbackedMintDisabled();
    }

    function decimals() public view override returns (uint8) { return assetDecimals; }
    function noteStore() external view returns (address) { return address(ZetoCommonStorage.layout().utxoStorage); }

    function deposit(uint256 amount, uint256[] calldata outputs, bytes calldata proof, bytes calldata data) public override {
        // The deposit circuit verifies exactly two commitments. Never mint an
        // additional commitment that is not one of those public signals.
        if (amount == 0 || outputs.length != 2) revert InvalidDepositShape();
        uint256 beforeBalance = backingAsset.balanceOf(address(this));
        super.deposit(amount, outputs, proof, data);
        uint256 afterBalance = backingAsset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert IncorrectAssetMovement();
    }

    /// @dev Upstream's withdrawal signals do not bind the payout recipient.
    ///      Fail closed until a reviewed recipient-bound circuit is integrated.
    function withdraw(uint256, uint256[] calldata, uint256, bytes calldata, bytes calldata) public pure override {
        revert WithdrawalProofBindingRequired();
    }
}
