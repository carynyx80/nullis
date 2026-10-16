# NULLIS

A two-page Robinhood Chain application: Swap and Profile. Profile includes assets, Send, Deposit, Withdraw, and an optional profile picture.

## Deploy on Vercel

Import this repository in Vercel and click Deploy. `vercel.json` configures the build (`node scripts/build-vercel.mjs`) and output directory (`public`). No environment variables are needed for this frontend deployment.

Use an EVM wallet extension or a compatible wallet browser. WalletConnect QR support is not configured.

## Works today

- Browser wallet discovery, account connection, and Robinhood Chain network switching.
- Read-only native/token wallet balances, optional Blockscout discovery, and manual token reads.
- Case-preserving local profile names and optional profile pictures.
- Client-side encrypted profile storage, locking, encrypted backup and restore.

## Not live financial infrastructure

**No real token deposits, withdrawals, transfers, swaps, shielded balances or zero-knowledge proofs are implemented. Financial actions stay disabled.** Uploading or deploying this code does not enable those features.

Global username registration is paused in the Vercel build. The optional registry backend uses Cloudflare D1; it is not run by a static Vercel deployment. Names entered in Vercel are local labels and are not globally reserved.

## Local development

Use Node 22.13+ (Node 24 recommended):

```
npm ci --ignore-scripts
npm start
npm test
npm run build:vercel
```

The local server runs at http://127.0.0.1:4318 with a separate persistent SQLite registry. `npm run build` produces the optional Cloudflare Worker artifact. Deployment-specific Sites identifiers and runtime data are intentionally excluded from GitHub.

## Privacy and backups

Profiles are encrypted on your device with a passphrase. NULLIS cannot reset that passphrase. Download an encrypted backup and keep its passphrase separately. Device storage is tied to the exact website origin; localhost and a Vercel domain do not share profiles. Use backup/restore when moving to a new domain.

Wallet RPC providers can see public balance requests. Optional explorer discovery sends the public wallet address to Blockscout. Local encryption is not transaction privacy, and does not protect against a compromised browser or maliciously altered application code.

## Source layout

- `dist/`: editable frontend source assets (not the generated Worker subdirectory).
- `registry/`, `db/`, `drizzle/`: optional case-sensitive SQL registry and migrations.
- `worker/`: Cloudflare Worker entrypoint.
- `scripts/`: Vercel/Worker builds and schema generation.
- `research/private-usernames/`: isolated experimental prototype; do not deploy as a production privacy service.
- `PROTOCOL.md`: protocol scope and outstanding requirements.
