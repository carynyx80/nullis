# Local deposit and withdrawal proof tools

This isolated experiment compiles Zeto's Apache-2.0 deposit circuit at commit
`dd495492f540c5f71988d15f8d3eb2b0d93c5099`, generates a new Groth16 proof,
verifies it, and rejects an altered public amount and inconsistent commitment.
It does not implement a production wallet, transfers, key recovery or an indexer.
The deposit amount and output commitments are public circuit signals.

`node probe-proof-mainnet.mjs` exports the test verifier, compiles its runtime
and checks the newly generated proof with `eth_call` code overrides on Robinhood
mainnet (4663). It accepts the valid proof and rejects an altered public amount.
The override is ephemeral: there is no persistent deployment or signed
transaction. The public RPC is the default; set server-only `NULLIS_MAINNET_RPC`
for another provider such as dRPC. No provider URL or response body is logged.
Code override support is required. Failures produce an unverified result, not
a successful compatibility claim.

## Run

Clone `https://github.com/LFDT-Paladin/zeto.git` to `research/zeto-upstream`,
check out the commit above, and keep tracked upstream files unmodified.
Then, in this directory, run `npm ci --ignore-scripts`, `npm run bootstrap`, and `npm test`.
Node 22+ is required. The compiler is restricted to this package's directory;
it does not need access to the user's home directory. On Windows x64, bootstrap
downloads the official Circom 2.2.2 executable into ignored artifacts and records
its hash. Other platforms use the pinned WASI package. Only the Windows native
compiler path has been validated here.

**Circuit-specific keys are UNSAFE LOCAL TEST MATERIAL.**
The deposit setup is generated locally. The withdrawal setup uses published
phase-one parameters but a local circuit-specific contribution, without an
independent production ceremony. Never deploy these verifiers or keys to a
chain that accepts real assets. All artifacts,
including private witness inputs, are ignored and never built into the website.
The experiment performs no network transaction and requires no wallet secret.

## Withdrawal setup

After generating the deposit artifacts, run `npm run setup:withdrawal`. It
compiles the new 64-level circuit, downloads phase-one parameters from
`https://circom.info/powersOfTau28_hez_final_17.ptau`, compares the full file with
the BLAKE2b-512 checksum in the pinned upstream manifest, and creates a locally
contributed circuit-specific key. snarkJS verifies the key before exporting the
verifier and recording source/R1CS/WASM/key hashes. Existing keys are reused
only when circuit and key hashes match. The download is about 151 MB and stays
in ignored artifacts. The published phase-one file does not make this local
phase-two setup production-ready.

Then run `npm test` in `../../contracts`. That suite creates fresh withdrawal
proofs using actual local contract addresses and checks partial/full payout,
recipient/network/pool/token binding, failed-transfer rollback, canonical keys,
inactive inputs, and spent-nullifier rejection. See `../../contracts/WITHDRAWAL.md`.

Production work still requires reviewed transfer/withdrawal circuits, verified
ceremony artifacts, compatible contracts, client-only keys and proofs, encrypted
note delivery, recovery and scanning, an independent review, and deployment
transactions signed by the deployment wallet. A successful proof here is only
one prerequisite. The reference toolkit contains variants with an auditing key;
those variants do not satisfy NULLIS's operator-blind requirement.

The inspected sample also inherits owner-only `mint` in
`solidity/contracts/lib/zeto_common.sol` and owner-authorized UUPS upgrades in
`solidity/contracts/zeto_anon_nullifier.sol`. Those capabilities need explicit
removal or a verified deployment design before using it as a deposit-backed
pool: unrestricted issuance must not create claims against users' deposits.
The one-shot ERC20 binding in `zeto_fungible.sol` is useful but does not remove
the separate upgrade and issuance capabilities. This experiment has not
implemented or reviewed that production adaptation.

Dependencies are isolated research tools, not production browser dependencies.
The pinned research dependency tree has npm security advisories and must not
be adopted unchanged for production services or the browser wallet.
No upstream source is redistributed by this harness; it compiles a local checkout.

References:
- https://github.com/LFDT-Paladin/zeto/tree/dd495492f540c5f71988d15f8d3eb2b0d93c5099
- https://github.com/iden3/snarkjs
