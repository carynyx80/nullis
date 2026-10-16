# NULLIS protocol specification and implementation boundary

## Product

Robinhood Chain only. Two pages: Swap and Profile. Profile contains username, optional picture, assets, Send, Deposit, and Withdraw. Internal transfers are addressed by username. No OTC, perpetuals, trading bots, or unrelated features.

## Implemented now

Browser-wallet integration and public wallet balance reads. Local profile creation with optional picture. Client-side password-derived AES-256-GCM encryption, encrypted device storage, locking, encrypted backup export, and backup restore bound to the connected wallet. These encrypted profiles contain no spending keys and cannot hold funds. Usernames are local labels, not globally registered names.

## Required privacy standard

Operators must not hold spending secrets or plaintext shielded balances, internal transfer details, or private transaction history. A private spending account must use a reviewed note/commitment/nullifier construction, onchain conservation proofs, client-side note decryption, independent withdrawal, and recoverable note scanning. Deposit and withdrawal boundaries remain public. Timing, network traffic, relayer metadata, token restrictions, and external execution leakage must be documented. Profile encryption is not transaction privacy.

## Mandatory invariants

1. No minting of shielded value without backing; fees and rounding are explicit.
2. No double spend or cross-chain/cross-contract replay.
3. A proof commits to its recipient outputs, asset, value constraints, expiry, execution route, slippage bound and chain domain where applicable.
4. Failed execution preserves claimable funds; adapters cannot redirect approvals or outputs.
5. Exit must remain possible without NULLIS's hosted application, indexer, or relayer.
6. Token policy excludes transfer behavior the accounting cannot support.
7. Recovery reconstructs funds from encrypted notes and chain history; losing a web database must not lose funds.
8. No public wallet-to-username registration. A public signed username mapping would violate the requested unlinkability.

## Username design remains a protocol dependency

Unique registration requires a shared registry and an authenticated ownership mechanism. A plain username hash does not hide low-entropy names from dictionary searches. Encrypting a central directory alone does not stop its operator from correlating registration and lookup. The design must resolve authenticated recipient keys, name ownership, lookup privacy, enumeration, key rotation, recovery, front-running, and anti-squatting. ZK ownership or an independently reviewed private directory construction must be selected before implementation; no central plaintext account directory is substituted.

## Swap feasibility gate

Ordinary external DEX execution reveals pair/amount through public calls and events, even if the source account uses shielded notes. RAILGUN's documented Relay Adapt flow unshields to an adapter, executes external calls, and reshields outputs atomically. That is a useful reference for sender unlinkability but does not prove the requested hidden pair/amount execution. A Robinhood-compatible deployment, compatible license and reviewed version, prover artifacts, gas/cost profile, relayer availability, real liquidity, and leakage analysis must all be verified. No compatible Robinhood deployment has been verified during this work.

To meet stronger trade-detail privacy, investigate reviewed shielded liquidity or aggregated execution with explicit leakage bounds. This requires liquidity capital and a separate protocol analysis. Do not present this as implemented by merely calling a DEX from a pool.

## Release acceptance gates

- Verified Robinhood testnet contract and circuit deployments, pinned sources and artifacts.
- Real two-user deposit/username-transfer/withdraw tests, randomized accounting invariants, reorg recovery, duplicate submission, key recovery, backend outages, and adversarial invalid proof tests.
- A real swap and failed-swap recovery with measured onchain leakage, client proving time, and gas.
- Independent cryptography and contract review covering exact sources, circuits, adapters and deployed bytecode; resolved material findings.
- Confirmed liquidity/token addresses, production infrastructure, operating keys held by the user, operating jurisdiction review and deployment ownership.
- Public privacy statements must describe measured protections rather than claim universal invisibility.

## Sources checked

- Robinhood chain and canonical token configuration: https://docs.robinhood.com/chain/connecting/ and https://docs.robinhood.com/chain/contracts/
- RAILGUN wallet setup: https://docs.railgun.org/developer-guide/wallet/getting-started
- RAILGUN external execution: https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls
- Deployment configuration reference: https://github.com/Railgun-Community/deployments
- Browser key derivation: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey

## Status

Not a fully functional private-token protocol and not ready for deposits. Missing protocol dependencies cannot be replaced by UI simulation. External deployment credentials, real-wallet verification, liquidity, and independent review are also outstanding. Fund-moving controls fail closed until those requirements are met.
