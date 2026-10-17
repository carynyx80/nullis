# NULLISPAD

Update: case-sensitive username registration is now implemented with durable SQL storage and separate encrypted ownership keys. See REGISTRY-DEPLOYMENT.md for exact behavior and publishing status. The user accepted username guessing and operator metadata visibility. The local preview has a persistent registry; no hosted deployment has succeeded yet.

Robinhood Chain application under development. The two pages are Swap and Profile; the latter contains assets, Send, Deposit, and Withdraw. Preserve the near-black purple design and supplied logo.

## Run

Use Node 22 or newer. No dependency installation is required for this static application.

```
npm start
npm test
npm run check
```

Open http://127.0.0.1:4318 in a browser with an injected EVM wallet, or use a compatible wallet's browser. Multiple browser wallets are discovered with EIP-6963. WalletConnect QR/mobile deep links are not configured.

## Current functionality

- Real browser-wallet permission flow and Robinhood Chain network switching.
- Native ETH and ERC-20 reads. Canonical tokens plus optional explorer discovery and manual token contracts.
- Optional profile picture, resized locally to a square PNG.
- Encrypted local profiles using Web Crypto PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM with independent random salt and IV.
- Create, edit, lock, unlock, export encrypted backup, and restore a profile with its passphrase.
- Profile locks on wallet changes, tab hiding and five minutes of inactivity.
- Encrypted profiles persist in this browser origin's local storage. A backup and passphrase are both required to restore on another device/origin. There is currently one saved profile per browser origin; import a matching backup for another wallet. Backups capture the profile as of export, so re-export after changes.

## Explicit limitations

Local encryption protects saved profile contents at rest; it is not a shielded account or a ZK protocol. No spending keys are created. Usernames are unregistered local labels and are not unique across devices. The profile owner address is inside encrypted data; the connected wallet address is public and visible in runtime memory. Optional token discovery sends that public address to Blockscout.

Decrypted data and the nonextractable encryption key are held in browser memory while unlocked. JavaScript cannot guarantee erasure of strings or protection from compromised devices, extensions, XSS, or maliciously changed application code. The hosted application supply chain requires review. NULLISPAD has no passphrase reset or server recovery key.

No real token approval, shield, transfer, unshield or swap is implemented. Financial controls remain disabled. No contract, prover, relayer, private username registry or liquidity adapter has been deployed. No independent cryptographic or contract audit has been obtained. Never present the application as ready for funds.

See PROTOCOL.md for required invariants, sources, unresolved protocol questions and launch gates; IMPLEMENTATION.md for wallet details. Tests use synthetic wallets and fixture DOM, plus real Web Crypto encryption. No real wallet has been tested in the sidebar browser. No transfer or swap privacy has been demonstrated.

An isolated private-username research prototype lives in `research/private-usernames/`. It has its own pinned dependencies, tests and HTTP demo. It is not connected to the UI; its attack tests demonstrate that the candidate does not meet the requested privacy guarantees. Never publish it as the production username registry.
