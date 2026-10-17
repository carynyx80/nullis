# Nullispad public beta

On 17 October 2026 the user approved public swaps and public deposits/withdrawals
for the initial release. This is a separate implementation from the experimental
shielded pool. It needs no ZK ceremony, custom spending key, private indexer or
operator-held secret. It does **not** provide transaction privacy.

Supported assets: ETH, canonical WETH, and canonical USDG (6 onchain decimals).
Swaps use direct Uniswap v3 WETH/USDG pools, with quotes across the configured fee
tiers. ETH is wrapped/unwrapped within the same transaction. ETH/WETH conversions
are labelled 1:1 wraps/unwraps. Arbitrary tokens and multihop routing are not supported.

## Contract

`PublicAccount.sol` keeps wallet-indexed balances. Deposits credit exact receipt;
withdrawals pay only the caller. Swaps debit only the caller's balance and credit
actual output, with a nonzero minimum and deadline. Router allowances are exact
and cleared after execution. Wrapping/redemption must move the exact backed value.
Reentrancy protection covers all mutations. Failed payouts and swaps revert
atomically. There is no administrator, fee collection, upgrade route or arbitrary
external-call facility. The user must keep ETH outside the account to pay gas.

The contract is new and **has not had an independent audit**. Token issuer freezes,
upgrades/restrictions and chain/RPC failures can still affect supported assets.
Local/fork checks are evidence of the tested behavior, not a guarantee of safety.

## Build and verify

Install the pinned contract tooling with `npm ci --ignore-scripts` in `account/`.
From the repository root, using Node 24:

```
node account/build.mjs
node account/probe.mjs
node account/prepare-web.mjs
node account/test-local.mjs
node account/test-fork.mjs
npm run test:public
npm run build:vercel
```

The fork test uses the exact browser transaction controller with an in-memory
wallet and actual mainnet WETH/USDG/Uniswap code. No fork transaction is submitted
to mainnet. It exercises deployment, approvals, ETH deposit, live quotes, both
swap directions, USDG withdrawal/redeposit, WETH wrapping and an empty final account.
Local adversarial tests cover payout/token/router failures and reentrancy. Reports
record source hashes. Test and witness artifacts stay outside the published site.

`prepare-web.mjs` copies the pinned ethers 6.13.1 browser distribution (MIT), and
embeds the account ABI, deployment bytecode, immutable offsets, expected network
hashes and configuration. `verification-input.json` is Solidity standard JSON input
for source verification; compiler 0.8.27, optimizer 200 runs, via IR, Shanghai.
Source and tests depend on OpenZeppelin 5.1.0 (MIT). No private key is embedded.

## Mainnet deployment — wallet signature required

1. Open the deployed site in a browser with an EVM wallet extension, or a wallet
   dapp browser. The Codex sidebar does not have an injected wallet.
2. Connect the deployment wallet and switch to Robinhood Chain (4663).
3. Choose Profile → Deposit → **Deploy public account · gas fee**. The wallet
   shows the deployment transaction and gas. This step does not deposit assets.
4. After confirmation, save the contract address and deployment transaction hash
   from the explorer link. The browser verifies runtime and immutable configuration
   before accepting the address. A pending deployment must be checked before retry.
5. Record and independently verify that live deployment:

```
node account/verify-deployment.mjs CONTRACT_ADDRESS DEPLOYMENT_TRANSACTION_HASH
node account/prepare-web.mjs
```

The verification command checks chain, creation transaction input/arguments,
successful receipt, block hash, runtime and immutable token/router settings. It
produces `deployment.json`; rebuilding then sets the verified shared contract as
the default for new visitors. Until that record exists the UI offers deployment
or connection of an existing verified contract. Never invent an address or treat
a fork receipt as a live receipt.

After live verification, use a small amount to confirm deposit → swap → withdrawal
in the actual wallet. A live success requires confirmed mainnet receipts; the
committed fork report is not that evidence.

## Recovery

Public account funds require the original wallet and the contract address, not
the encrypted profile's passphrase. Connect the wallet on another browser and
use the verified shared contract or enter its address. Balances come directly
from the contract. Browser transaction history is only a local convenience;
the block explorer retains public history. No profile reset can move funds.

Browser code checks chain/account before sending, simulates each action,
estimates gas, requests exact approvals and tracks receipt status. It never
automatically retries a pending submission. Quotes expire and are invalidated
by wallet/asset/amount/slippage changes. Every financial write needs a wallet
confirmation; no deployment key or server signing service is used.

References: [Uniswap deployment list](https://developers.uniswap.org/deployments),
[official SDK addresses](https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts),
[router interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol),
[Robinhood network details](https://docs.robinhood.com/chain/connecting/).
