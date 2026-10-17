# Nullispad implementation

The initial release uses a public wallet-indexed account, not shielded notes.
The user approved this scope on 17 October 2026. See account/README.md for the
contract and transaction path, tests, deployment guide and recovery.

- wallet-core.js / wallet-app.js: EIP-6963 and EIP-1193 connection, chain switching,
  public wallet balances, optional explorer discovery, and stale-session handling.
- profile.js / vault.js / vault-ui.js: optional profile picture and encrypted local
  profile backup/restore. These contain no spending keys.
- account-core.js: verified public account bytecode/configuration, exact amount
  parsing, supported token reads, Uniswap v3 quotes, simulation, gas estimation,
  exact approvals, wallet submission and receipt tracking.
- account-app.js: public account assets, deployment/connection, deposit/withdrawal
  forms, public swap review, pending/reverted/confirmed activity and stale quote
  invalidation. All amounts and transactions are public.
- account-config.js / chain-core.js: generated public artifact and pinned ethers
  browser runtime. No private key or private RPC URL is embedded.

The new account has no independent audit. Send, arbitrary-token settlement,
multihop swaps, private balances and transaction privacy are not implemented.
A mainnet contract must be deployed by a user-signed wallet transaction and its
receipt verified before claiming a live protocol. Local and fork tests never
send mainnet transactions. The profile passphrase is unrelated to account funds.
