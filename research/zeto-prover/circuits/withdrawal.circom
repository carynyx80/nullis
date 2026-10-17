// SPDX-License-Identifier: GPL-3.0
pragma circom 2.2.2;
include "./circuits/lib/check-nullifiers-value-base.circom";

// Public signal order: amount, nullifiers[2], root, enabled[2],
// outputCommitments[1], context. This exact order is checked by the tests.
template NullisWithdrawal() {
    signal input nullifiers[2];
    signal input inputCommitments[2];
    signal input inputValues[2];
    signal input inputSalts[2];
    signal input inputOwnerPrivateKey;
    signal input root;
    signal input merkleProof[2][64];
    signal input enabled[2];
    signal input outputCommitments[1];
    signal input outputValues[1];
    signal input outputSalts[1];
    signal input outputOwnerPublicKeys[1][2];
    signal input context;
    signal output amount;

    component core = CheckNullifiersInputsOutputsValue(2, 1, 64);
    // A scalar and scalar + subgroup order produce the same owner point but
    // different nullifier hashes. Require one nonzero canonical representative.
    component keyBits = Num2Bits(252);
    keyBits.in <== inputOwnerPrivateKey;
    component keyRange = LessThan(252);
    keyRange.in[0] <== inputOwnerPrivateKey;
    keyRange.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    keyRange.out === 1;
    component keyZero = IsZero();
    keyZero.in <== inputOwnerPrivateKey;
    keyZero.out === 0;
    core.inputOwnerPrivateKey <== inputOwnerPrivateKey;
    core.root <== root;
    component nullifierZero[2];
    component commitmentZero[2];
    component inputRange[2];
    for (var i = 0; i < 2; i++) {
        enabled[i] * (enabled[i] - 1) === 0;
        nullifierZero[i] = IsZero();
        nullifierZero[i].in <== nullifiers[i];
        nullifierZero[i].out === 1 - enabled[i];
        commitmentZero[i] = IsZero();
        commitmentZero[i].in <== inputCommitments[i];
        commitmentZero[i].out === 1 - enabled[i];
        (1 - enabled[i]) * inputValues[i] === 0;
        (1 - enabled[i]) * inputSalts[i] === 0;
        inputRange[i] = Num2Bits(100);
        inputRange[i].in <== inputValues[i];
        core.nullifiers[i] <== nullifiers[i];
        core.inputCommitments[i] <== inputCommitments[i];
        core.inputValues[i] <== inputValues[i];
        core.inputSalts[i] <== inputSalts[i];
        core.enabled[i] <== enabled[i];
        for (var j = 0; j < 64; j++) core.merkleProof[i][j] <== merkleProof[i][j];
    }
    component outputRange = Num2Bits(100);
    outputRange.in <== outputValues[0];
    component outputZero = IsZero();
    outputZero.in <== outputCommitments[0];
    outputZero.out * outputValues[0] === 0;
    outputZero.out * outputSalts[0] === 0;
    core.outputCommitments[0] <== outputCommitments[0];
    core.outputValues[0] <== outputValues[0];
    core.outputSalts[0] <== outputSalts[0];
    for (var j = 0; j < 2; j++) core.outputOwnerPublicKeys[0][j] <== outputOwnerPublicKeys[0][j];
    amount <== core.out;
    component amountRange = Num2Bits(100);
    amountRange.in <== amount;

    // Keep the intent hash in a nonlinear constraint, so it cannot disappear
    // as an unused public input during optimization. Tampering is tested.
    signal contextSquare;
    contextSquare <== context * context;
}
component main {public [nullifiers, root, enabled, outputCommitments, context]} = NullisWithdrawal();
