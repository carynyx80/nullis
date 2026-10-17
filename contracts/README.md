# NULLIS contract adaptation — local development only

This is the first contract implementation stage. It is not a mainnet deposit
product. There is no mainnet deployment script, approved production proving key,
working withdrawal flow, or frontend financial integration here.

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
- Withdrawals fail closed with `WithdrawalProofBindingRequired`. The inspected
  upstream withdrawal statement does not bind a payout recipient. It must be
  adapted and verified before withdrawals can be enabled.

The inherited encrypted-transfer machinery is not end-to-end tested here and
must not be described as working private transfers. Tests configure rejecting
transfer and withdrawal verifiers. They use a real, newly generated **local-only**
deposit proof and test ERC20 assets, not a permissive deposit verifier.

## Build and test

Node 24 and Git are recommended. From this directory:

```
npm ci --ignore-scripts
npm run bootstrap
npm run build
```

Generate the isolated test proving artifacts using `../research/zeto-prover/`
(see its README), then run `npm test` here. All transactions use an in-memory
Ganache provider with chain 31337; no deployment key or RPC URL is read.
Ganache's optional native networking module may fall back to JavaScript.

Tests enforce normal EIP-170 contract-size limits and exercise initialization,
permission removal, actual deposit-proof verification, duplicate commitments,
fee-on-transfer rejection, failed-token-transfer rollback, retry, reentrancy,
and direct note-store access. They do not validate withdrawal/transfer proofs,
full economic invariants, privacy, recovery, or production ceremony provenance.

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

Finish and independently review recipient-bound withdrawals, transfer proofs,
encrypted note discovery, spending-key recovery, and conservation/replay tests.
Verify production trusted-setup provenance and deployment artifacts. Only then
prepare a mainnet transaction bundle and enable financial UI actions. Arbitrary
malicious, rebasing, fee-taking or issuer-restricted tokens are not automatically
supported. This package has not undergone an independent security audit.
