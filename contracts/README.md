# NULLIS contract adaptation — local development only

This is a local deposit/withdrawal contract prototype. It is not a mainnet
deposit product. There is no mainnet deployment script, approved production
proving key, or frontend financial integration here.

Read-only mainnet verifier checks and a WETH fork integration test are available
in [MAINNET.md](./MAINNET.md). Neither sends transactions to the live chain or
approves the current test proving material for production.

## Implemented

- `NullisPool.sol` permanently rejects external minting of unbacked notes.
- The implementation commits to one ERC20 asset and one verifier-address bundle.
- `NullisPoolProxy.sol` initializes atomically in its constructor. Initialization
  leaves no current or pending owner; the implementation itself cannot initialize.
- The adapted upgrade authorization always reverts, regardless of ownership.
- Deposits must contain exactly two circuit-proven commitments and a nonzero
  amount. The ERC20 balance increase must equal the deposit amount; a short
  transfer reverts all note and token effects.
- Unused lock/delegation routes are disabled to keep scope and runtime size down.
- Withdrawals use a new eight-signal, 64-level circuit and pay the recipient
  committed by the proof. Payouts must debit and credit exactly the authorized
  amount. Nullifiers and change notes roll back if the payout fails.

The inherited private-transfer entry point always reverts until a separately
reviewed transfer construction is ready. This is enforced by code, independently
of any verifier configuration. A full protocol release will need that construction
before its immutable contracts are deployed. Deposit and withdrawal tests use actual newly generated
**local-only** Groth16 proofs and test ERC20 assets, not permissive verifiers.
See `WITHDRAWAL.md` for the exact statement and remaining review requirements.

## Build and test

Node 24 and Git are recommended. From this directory:

```
npm ci --ignore-scripts
npm run bootstrap
npm run build
```

Generate both deposit and withdrawal test proving artifacts using
`../research/zeto-prover/` (see its README), then run `npm test` here. All transactions use an in-memory
Ganache provider with chain 31337; no deployment key or RPC URL is read.
Ganache's optional native networking module may fall back to JavaScript.

Tests enforce normal EIP-170 contract-size limits and exercise initialization,
permission removal, actual deposit-proof verification, duplicate commitments,
fee-on-transfer rejection, failed-token-transfer rollback, retry, reentrancy,
and direct note-store access. The withdrawal suite covers partial and full
withdrawals, a single active input, redirect/replay attempts, cross-pool/network
binding, short/failed payouts, reentrancy and canonical-key/unused-input checks.
These checks are not a full economic audit, private-transfer validation,
privacy assessment, recovery test or production ceremony review.

Compilation caching compares source, dependency, compiler and adaptation hashes.
It never enables unlimited contract size or substitutes accepting mock verifiers.

## Source adaptations and licensing

References are pinned in `references.json`. `patches.mjs` applies explicit changes
in memory to clean upstream contract sources: make deposit/withdraw overrideable,
disable UUPS authorization, and disable 15 unused lock functions. Original headers
are retained; originals are never edited. Compilation records original and adapted
source hashes in `artifacts/compiled.json`. No upstream checkout is uploaded.

The adaptation is GPL-3.0 because it links GPL-3.0 iden3 components. Zeto sources
retain their Apache-2.0 notices; OpenZeppelin retains MIT notices. See `LICENSE`
and `NOTICE.md`. Generated verifiers retain their own license notices. Source and
bytecode license obligations apply to any future distribution.

Poseidon library placeholders in the upstream Solidity are linked in tests to
actual generated Poseidon bytecode from pinned circomlibjs. They must never be
deployed as empty hash stubs. A production deployment must verify every linked
runtime and verifier against reviewed artifacts.

Pinned local testing tools have security advisories. They are isolated from the
Vercel application and must not be adopted unchanged for a production service.

## Before real funds

Independently review the new withdrawal statement and its contract integration.
Finish transfer proofs, encrypted note discovery, spending-key recovery, and
broader conservation/replay testing.
Verify production trusted-setup provenance and deployment artifacts. Only then
prepare a mainnet transaction bundle and enable financial UI actions. Arbitrary
malicious, rebasing, fee-taking or issuer-restricted tokens are not automatically
supported. This package has not undergone an independent security audit.
