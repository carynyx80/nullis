# Mainnet preparation

No production pool is deployed by these commands. They do not request wallet
signatures, approvals, seed phrases or private keys. An RPC connection does not
authorize spending from the deployment wallet.

## Read-only verification

Use Node 24, complete the local proof setup and integration tests, then run from
`contracts/`:

```powershell
$env:NULLIS_DEPLOYER = 'YOUR_PUBLIC_WALLET_ADDRESS'
npm run preflight:mainnet
npm run test:mainnet-fork
```

The preflight reads `NULLIS_MAINNET_RPC` from the ignored root `.env.local` file
or uses Robinhood's public endpoint. `NULLIS_ASSET` optionally selects the candidate
ERC20. It requires chain 4663, a recent block, matching local source/proof setup
hashes and readable token metadata. Ephemeral `eth_call` code overrides exercise
the actual generated withdrawal verifier against both local fixtures and mutations
of all eight public signals. This verifies mainnet EVM arithmetic, not a live
deposit or withdrawal. Reports never record the private RPC URL.

The wallet balance and current gas price are recorded. The pool runtime's code
deposit alone supplies a lower bound; constructors, other contracts and L1 data
fees make a complete deployment more expensive. A positive wallet balance is
not evidence of sufficient deployment funding.

## WETH fork round trip

The fork test only accepts the candidate WETH address already used in the wallet
interface: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`. This remains subject to
independent asset/source review. Its runtime hash must match the pinned mainnet
block in the fresh preflight report.

The in-memory fork uses chain ID 4663 and normal EIP-170 limits. All accounts,
ETH balances, wrapping, contract deployments and signed transactions are local.
No user wallet is imported. It wraps 300 wei of local ETH using the mainnet WETH
contract, deposits the resulting 300 base units, and generates fresh proofs bound
to the fork's actual pool, token, chain and recipient. It withdraws 120 and 180
base units and checks the empty pool, payout balances, proof intent, invalid
witnesses and spent nullifiers. Test-token payout faults are covered separately
by `npm test`; WETH has no fault-injection methods.

The default fork RPC is Robinhood's official public endpoint. A provider with
historical storage access can be selected using `NULLIS_FORK_RPC`. Some app RPC
load balancers serve current calls but fail historical storage or nonce reads.
A failed fork must not be treated as a passing deployment check. Fork proofs are
stored separately from the default local fixtures.

Reports are in ignored `artifacts/mainnet-preflight.json` and
`artifacts/mainnet-fork.json`. Even successful reports keep `productionReady`
false. A report's `passed` means the described verification passed; it does not
mean production is ready. Deployment gas from a fork is not a mainnet quote.

## Work still needed before real assets

1. Complete the browser spending-key wallet: canonical keys, encrypted note
   discovery, backup/restore and proof generation. Existing profile backups do
   not recover shielded funds. Test restore in a fresh browser and withdraw.
2. Freeze the circuit and contract sources and obtain independent cryptographic
   and contract review. Fix findings and repeat the circuit/contract tests.
3. Conduct and independently verify circuit-specific production setup for both
   circuits. Preserve the reviewed source, R1CS, WASM, verification key, zkey and
   contribution transcript hashes. Current local test keys must not secure funds.
4. Generate the exact linked libraries, verifier adapters, implementation and
   atomically initialized proxy deployment artifacts. Review their provenance,
   token behavior, verified sources, constructor arguments and runtime hashes.
5. Estimate the complete mainnet transaction bundle with current prices. Fund
   the deployment wallet with ETH on Robinhood Chain; never disclose its seed.
   Submit transactions through the wallet and record confirmed receipts.
6. Verify all live code/configuration against reviewed artifacts. Connect the
   client and perform a minimal real WETH deposit, partial withdrawal and full
   withdrawal using recoverable user notes before enabling public deposits.

The current immutable pool disables private transfers. A future release that
requires transfers needs a reviewed transfer implementation before deployment;
this pool cannot acquire that feature through an upgrade. Deposit and withdrawal
amounts and boundary addresses are public. None of these checks establish total
transaction privacy.

Network reference: [Robinhood deployment documentation](https://docs.robinhood.com/chain/deploy-smart-contracts/).
