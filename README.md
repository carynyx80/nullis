# Nullispad

Robinhood Chain public beta: Swap and Profile, with ETH/WETH/USDG balances,
deposit and withdrawal. The user approved public transactions for the initial
release. All financial activity is visible onchain. The new public account
contract has not had an independent audit.

## Run

Use Node 22+ (Node 24 for contract tooling):

```
npm ci
npm start
npm test
npm run check
npm run build:vercel
```

Open http://127.0.0.1:4318 in a browser with an injected EVM wallet or a wallet's
dapp browser. WalletConnect QR is not configured. The sidebar browser has no wallet.

## Account and transactions

The browser can deploy the public account using the connected wallet, verify an
existing account contract, read its wallet-indexed balances, deposit ETH or exact
ERC20 amounts, quote and execute Uniswap v3 swaps, and withdraw to the connected
wallet. Deployment and all transactions require wallet confirmation and gas.
There is no server signing key. No mainnet deployment is claimed until its
receipt and bytecode have been verified; without a default deployment, Deposit
opens the deployment/connection flow.

Only ETH, canonical WETH and canonical USDG are supported for settlement. USDG
decimals are read onchain (currently 6). Quotes use supported direct Uniswap v3
pools; ETH/WETH is 1:1 wrapping. There are no hidden fees or admin withdrawal/
upgrade functions. Failed transactions revert account changes; gas can be spent.
Slippage, token issuer restrictions, network conditions and new contract risk
remain relevant. This public beta is not the future privacy protocol.

See [account/README.md](account/README.md) for the architecture, tests, exact
mainnet deployment guide, source-verification input and recovery. The fork tests
exercise the browser transaction controller, actual mainnet contracts and the
complete deposit/swap/withdraw flow, but do not submit live transactions.

## Profiles and recovery

Profiles support optional pictures and password-based local encryption using
PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM. Existing encrypted backups
remain compatible with the rename. Export a backup after editing a profile;
there is no server passphrase reset. Profiles lock on wallet changes, tab hiding
and inactivity. Global username registration and Send remain disabled in the
hosted release.

A profile backup does not control public account funds. To recover balances on a
new device, connect the original wallet and the same verified contract address.
Onchain balances are independent of local profile data and transaction history.
Do not share your wallet seed phrase or private key with Nullispad or an operator.

Static web assets are published to Vercel. RPC keys, research checkouts, private
proof material, test state and local databases are excluded. The experimental
shielded protocol in contracts/ and research/ remains separate from this release.
