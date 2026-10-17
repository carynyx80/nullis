// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Groth16Verifier} from "./LocalVerifier.sol";

contract TestAsset is ERC20 {
    bool public fee;
    bool public returnsFalse;
    bool public payoutReturnsFalse;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;
    bytes4 public callbackFailure;
    constructor() ERC20("Local test asset", "TEST") { _mint(msg.sender, 1_000_000_000); }
    function decimals() public pure override returns (uint8) { return 6; }
    function setFee(bool value) external { fee = value; }
    function setReturnsFalse(bool value) external { returnsFalse = value; }
    function setPayoutReturnsFalse(bool value) external { payoutReturnsFalse = value; }
    function setCallback(address target, bytes calldata data) external { callbackTarget = target; callbackData = data; }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (returnsFalse) return false;
        attemptCallback();
        return super.transferFrom(from, to, amount);
    }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (payoutReturnsFalse) return false;
        attemptCallback();
        return super.transfer(to, amount);
    }
    function attemptCallback() internal {
        if (callbackTarget != address(0)) {
            bytes memory result;
            (callbackSucceeded, result) = callbackTarget.call(callbackData);
            if (!callbackSucceeded && result.length >= 4) callbackFailure = bytes4(result);
        }
    }
    function _update(address from, address to, uint256 value) internal override {
        if (fee && from != address(0) && to != address(0) && value > 0) {
            super._update(from, to, value - 1);
            super._update(from, address(0), 1);
        } else super._update(from, to, value);
    }
}

contract RejectVerifier {
    function verify(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[] calldata) external pure returns (bool) { return false; }
}

contract DepositVerifierAdapter {
    Groth16Verifier public immutable verifier;
    constructor(Groth16Verifier verifier_) { verifier = verifier_; }
    function verify(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[] calldata signals) external view returns (bool) {
        if (signals.length != 3) return false;
        uint256[3] memory fixedSignals = [signals[0], signals[1], signals[2]];
        return verifier.verifyProof(a, b, c, fixedSignals);
    }
}

contract InitializedProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory initialization) ERC1967Proxy(implementation, initialization) {}
}
