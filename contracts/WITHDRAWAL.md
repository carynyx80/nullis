# Recipient-bound withdrawal prototype

This statement and its integration have not had an independent cryptography or
contract audit. Local round-trip tests do not establish production safety.

## Public signal layout

The circuit in `research/zeto-prover/circuits/withdrawal.circom` publishes eight
field elements, in this exact order:

```
amount, nullifier0, nullifier1, root, enabled0, enabled1, changeCommitment, context
```

The contract derives the enabled flags from zero/nonzero nullifiers. It requires
exactly two slots, at least one active input, and a positive amount below 2^100.
Membership is checked against a previously accepted Poseidon sparse-tree root.
Spent nullifiers are permanent, including when an older valid root is used.

The proof constrains note ownership, membership, nullifiers and value conservation
through the pinned Zeto circuit. Additional constraints require boolean enabled
flags, consistent zero/nonzero commitments/nullifiers, zero value and salt in
unused slots, 100-bit values, and zero change value/salt when its commitment is zero.

The spending scalar must be nonzero and strictly less than the BabyJubjub subgroup
order (2736030358979909402780800718157159386076813972158567259200215660948447373041).
A scalar plus the subgroup order represents the same owner point but must not
produce a second usable nullifier. Client key derivation and any future transfer
circuit must use the same canonical scalar convention. The current client has
not implemented this spending-key wallet or its recovery.

## Intent binding

`context` is the unsigned Keccak-256 result of the following ABI encoding,
reduced modulo the BN254 scalar field:

```
bytes32 keccak256("NULLIS_WITHDRAWAL_V1")
uint256 chainId
address pool
address backingAsset
address recipient
uint256 amount
uint256[] nullifiers
uint256 changeCommitment
bytes32 keccak256(changeData)
```

The circuit retains this public input with a nonlinear square constraint. The
suite verifies that changing context fields invalidates an existing proof. This
binding pattern is also described in the public-input constraints of the
[reference withdrawal circuit](https://github.com/tornadocash/tornado-core/blob/master/circuits/withdraw.circom).
That reference is not a substitute for reviewing the new circuit.

Any caller may relay an unchanged proof. It still pays the authorized recipient;
the relayer cannot replace it, modify the amount/change, or claim a fee. Replaying
a successfully executed proof fails because its nullifiers have been consumed.

## Contract encoding and settlement

`withdraw(amount, inputs, changeCommitment, proof, data)` takes:

- `proof`: ABI encoding of `(uint256 root, Commonlib.Proof proof)`.
- `data`: ABI encoding of `(address recipient, bytes changeData)`.

The contract derives the context itself. It verifies the eight public signals,
consumes nullifiers and inserts change before the ERC20 payout. Reentrancy is
guarded. Both vault debit and recipient credit must equal the proven amount;
an error reverts all note, nullifier and token changes atomically.

The inherited `UTXOWithdraw` event records the payout recipient in its historical
`submitter` address field. That address is not necessarily the gas payer. Indexers
must use the transaction sender for the relayer and the event address for the recipient.

The upstream `spent(utxo)` getter intentionally returns UNKNOWN for private note
commitments. Tests inspect actual nullifier rejection through the store's
`validateInputs`; they do not infer note spending from that getter.

The test suite uses opaque bytes for change data. It does not implement or prove
encrypted note delivery, private transaction submission, user recovery, or
privacy of deposits/withdrawals. Boundary amounts and recipient addresses are
public. The frontend's financial actions remain disabled.

The inherited private-transfer entry point is disabled. A future transfer circuit
needs the same canonical-key and unused-input constraints before integration.

## Proof material

Phase-one parameters are downloaded from the host currently linked by snarkJS
and compared with the pinned Zeto BLAKE2b-512 checksum. The circuit-specific setup
is generated locally with a local contribution and verified with snarkJS. These
are **not production ceremony keys**. Setup metadata records source, R1CS, witness
WASM and key hashes. The test harness rejects stale or mismatched metadata.

Real-asset deployment still requires independent review, verified production
setup provenance and deployment artifacts, a complete client spending-key and
recovery implementation, supported-token review, and broader adversarial tests.
