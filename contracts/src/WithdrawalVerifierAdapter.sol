// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;
import {IGroth16Verifier} from "zeto/lib/interfaces/IZetoVerifier.sol";
interface IWithdrawalProofVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[8] calldata signals) external view returns (bool);
}

/// @notice Adapts the fixed eight-signal withdrawal verifier to the pool interface.
contract WithdrawalVerifierAdapter is IGroth16Verifier {
    IWithdrawalProofVerifier public immutable proofVerifier;
    constructor(IWithdrawalProofVerifier verifier) {
        require(address(verifier).code.length > 0, "MISSING_VERIFIER_CODE");
        proofVerifier = verifier;
    }
    function verify(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[] calldata signals) external view returns (bool) {
        if (signals.length != 8) return false;
        uint256[8] memory fixedSignals;
        for (uint256 i = 0; i < 8; i++) fixedSignals[i] = signals[i];
        return proofVerifier.verifyProof(a, b, c, fixedSignals);
    }
}
