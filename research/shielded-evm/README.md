# Shielded-wallet foundation: verifier compatibility

This milestone checks prerequisites for a private-token protocol. It does NOT implement a shielded wallet or token transfer system.

## Run

With Node 22+ (Node 24 recommended) and Git:

```
cd research/shielded-evm
npm ci --ignore-scripts
node bootstrap.mjs
node verify-local.mjs
node probe-testnet.mjs
```

The reference contract commit is pinned in `upstream.json`. The bootstrap fetches it into ignored `research/railgun-upstream/`. Existing checkouts are not reset. No reference source, compiled reference bytecode or numeric proof fixtures are redistributed in this repository. The source is marked `UNLICENSED`; production redistribution/deployment permission has not been established.

## Local verifier checks

`verify-local.mjs` checks that the reference checkout is pinned and tracked files are unmodified. It compiles the reference Groth16 verifier and test stub with solc 0.8.17. Test fixture extraction permits data literals only; it does not execute the upstream test suite or dependency scripts. It starts a local, in-memory Ganache EVM with chain ID 46630, deploys ONLY to that local EVM, and checks:

- BN254 addition and scalar multiplication.
- Positive and negative pairing cases.
- Acceptance of the pinned valid Groth16 fixture.
- Rejection of the pinned invalid proof, changed public input, out-of-field input and malformed point.
- Point-at-infinity handling.

It records source hashes, compiler version, verifier runtime size and a gas estimate. These are reference-fixture checks, not proof generation, accounting invariants, circuit review, an audit or an end-to-end deposit/transfer/withdraw test. Setting a local chain ID does not reproduce Robinhood Chain execution or sequencer behavior.

Ganache may report a native networking module mismatch and use its JavaScript fallback. The harness does not open an RPC listener and does not need that native module. Old pinned research dependencies are isolated from the deployed frontend and are not used to handle real funds.

## Robinhood testnet probe

`probe-testnet.mjs` uses only read-only JSON-RPC calls. It checks the chain ID equals 46630 before sending precompile calls, pins calls to one block and rechecks the network. The documented public testnet RPC is the default. An optional `NULLIS_TESTNET_RPC` environment variable can select another provider; its URL is never printed because it may contain credentials.

The testnet report does not assert that a RAILGUN deployment exists, that the entire verifier has executed on testnet, or that an SDK/indexer/relayer/prover is compatible. It sends no signed transaction and uses no deployment wallet or private key.

## Mainnet arithmetic probe

Run `node --test probe-mainnet.test.mjs` and `node probe-mainnet.mjs`.
This uses the documented public Robinhood mainnet endpoint by default, or a
server-only `NULLIS_MAINNET_RPC` endpoint (including dRPC). It requires chain
4663, pins arithmetic checks to one block, and checks the chain again afterward.
No wallet, signed transaction or deployment is involved. Provider URLs are not
printed. Results are written to ignored `mainnet-results.json`.
Passing these checks does not establish a functioning privacy protocol.

## Remaining integration work

1. Select a deployable privacy construction with confirmed usage rights and reviewed contract/circuit versions. RAILGUN is a reference candidate, not selected for production: the inspected SDK configuration has no Robinhood entry, and the source permission question is unresolved.
2. Obtain and verify circuit artifacts and trusted-setup provenance, generate a new proof and verify it.
3. Integrate note commitments, nullifiers, Merkle membership, encrypted delivery and recoverable local balance scanning.
4. Test deposits, private transfers and withdrawals on a local EVM with the actual prover; verify conservation, replay resistance and failure recovery.
5. Confirm Robinhood testnet deployment configuration and deploy from a user-authorized test wallet; repeat the complete flow and assess privacy leakage.
6. Independently review the exact contracts, circuits and client implementation before real funds.

No financial UI actions are enabled by this research. Usernames remain outside this milestone. No candidate production protocol or deployment is implied by the successful arithmetic checks.

## Primary references

- https://github.com/Railgun-Privacy/contract/tree/36bcf5ed7cf94bfafb6e1a303e1832c769c16780
- https://github.com/Railgun-Community/shared-models/blob/main/src/models/network-config.ts
- https://docs.robinhood.com/chain/connecting/
- https://eips.ethereum.org/EIPS/eip-196
- https://eips.ethereum.org/EIPS/eip-197
