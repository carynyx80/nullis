import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider, ContractFactory, Contract, AbiCoder, ZeroAddress, keccak256, id} from 'ethers';
import {poseidonContract} from 'circomlibjs';
import {compileCached, root} from './compile.mjs';
import {testWithdrawals} from './withdrawal-test.mjs';
import {createHash} from 'node:crypto';

console.log('Compiling adapted contracts and local test verifier');
const prover = resolve(root, '../research/zeto-prover/artifacts');
const validation = JSON.parse(readFileSync(resolve(prover, 'results.json')));
assert.equal(validation.passed, true); assert.equal(validation.productionSetup, false);
const withdrawalSetup = JSON.parse(readFileSync(resolve(prover, 'withdrawal-setup.json')));
const hashFile = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(withdrawalSetup.productionSetup,false);
assert.equal(withdrawalSetup.circuitHash,hashFile(resolve(prover,'withdrawal.r1cs')));
assert.equal(withdrawalSetup.keyHash,hashFile(resolve(prover,'UNSAFE-WITHDRAWAL-LOCAL-ONLY.zkey')));
assert.equal(withdrawalSetup.wrapperHash,hashFile(resolve(root,'../research/zeto-prover/circuits/withdrawal.circom')));
assert.equal(withdrawalSetup.wasmHash,hashFile(resolve(prover,'withdrawal_js/withdrawal.wasm')));
const output = compileCached({
  'test/Fixtures.sol': {content: readFileSync(resolve(root, 'test/Fixtures.sol'), 'utf8')},
  'test/LocalVerifier.sol': {content: readFileSync(resolve(prover, 'LocalVerifier.sol'), 'utf8')},
  'test/WithdrawalVerifier.sol': {content: readFileSync(resolve(prover, 'WithdrawalVerifier.sol'), 'utf8')}
});
mkdirSync(resolve(root, 'artifacts'), {recursive: true});
writeFileSync(resolve(root, 'artifacts/compiled.json'), JSON.stringify(output));
const poolArtifact = output.contracts['src/NullisPool.sol'].NullisPool;
const runtimeBytes = poolArtifact.evm.deployedBytecode.object.length / 2;
assert.ok(runtimeBytes <= 24576, 'Pool exceeds EIP-170; unlimited-size tests are forbidden');
const eip1193 = ganache.provider({chain: {chainId: 31337, hardfork: 'shanghai', allowUnlimitedContractSize: false},
  miner: {blockGasLimit: 60000000}, wallet: {totalAccounts: 3}, logging: {quiet: true}});
const provider = new BrowserProvider(eip1193); provider.pollingInterval = 10;
const signer = await provider.getSigner(0), attacker = await provider.getSigner(1);
const libraries = new Map(), checks = [];
const coder = AbiCoder.defaultAbiCoder();
async function deploy(file, name, args = []) {
  const artifact = output.contracts[file][name];
  let bytecode = artifact.evm.bytecode.object;
  for (const [libraryFile, entries] of Object.entries(artifact.evm.bytecode.linkReferences)) {
    for (const [libraryName, positions] of Object.entries(entries)) {
      const key = libraryFile + ':' + libraryName;
      if (!libraries.has(key)) {
        let library;
        if (/^PoseidonUnit[23]L$/.test(libraryName)) {
          const width = Number(libraryName.match(/[23]/)[0]);
          library = await new ContractFactory(poseidonContract.generateABI(width), poseidonContract.createCode(width), signer).deploy();
          await library.waitForDeployment();
        } else library = await deploy(libraryFile, libraryName);
        libraries.set(key, await library.getAddress());
      }
      for (const {start, length} of positions) {
        assert.equal(length, 20);
        bytecode = bytecode.slice(0, start * 2) + libraries.get(key).slice(2) + bytecode.slice((start + length) * 2);
      }
    }
  }
  assert.ok(!bytecode.includes('__'), 'Unlinked library');
  const contract = await new ContractFactory(artifact.abi, '0x' + bytecode, signer).deploy(...args);
  await contract.waitForDeployment(); return contract;
}
async function reject(action, expected, iface) {
  let failure;
  try {await action();} catch (error) {failure = error;}
  assert.ok(failure, 'Expected transaction/call rejection');
  const data = failure.data || failure.info?.error?.data?.result;
  let actual; try {actual = iface.parseError(data)?.name;} catch {}
  assert.equal(actual, expected, 'Expected specific contract rejection: ' + expected);
}
const proof = JSON.parse(readFileSync(resolve(prover, 'proof.json'))), signals = JSON.parse(readFileSync(resolve(prover, 'public.json')));
const zkeyArgs = [proof.pi_a.slice(0, 2), [proof.pi_b[0].slice(0, 2).reverse(), proof.pi_b[1].slice(0, 2).reverse()], proof.pi_c.slice(0, 2)];
const encodedProof = coder.encode(['tuple(uint256[2] pA,uint256[2][2] pB,uint256[2] pC)'], [zkeyArgs]);
const commitments = signals.slice(1), amount = BigInt(signals[0]);
const tuple = 'tuple(address verifier,address depositVerifier,address withdrawVerifier,address lockVerifier,address burnVerifier,address batchVerifier,address batchWithdrawVerifier,address batchLockVerifier,address batchBurnVerifier)';
try {
  assert.equal(Number((await provider.getNetwork()).chainId), 31337);
  const generated = await deploy('test/LocalVerifier.sol', 'Groth16Verifier');
  const adapter = await deploy('test/Fixtures.sol', 'DepositVerifierAdapter', [await generated.getAddress()]);
  const withdrawalGenerated = await deploy('test/WithdrawalVerifier.sol', 'Groth16Verifier');
  const withdrawalAdapter = await deploy('src/WithdrawalVerifierAdapter.sol','WithdrawalVerifierAdapter',[await withdrawalGenerated.getAddress()]);
  const rejecting = await deploy('test/Fixtures.sol', 'RejectVerifier');
  const rejectAddress = await rejecting.getAddress();
  const verifiers = [rejectAddress, await adapter.getAddress(), await withdrawalAdapter.getAddress(), rejectAddress, rejectAddress, rejectAddress, rejectAddress, rejectAddress, rejectAddress];
  const configuration = keccak256(coder.encode([tuple], [verifiers]));
  async function makePool(asset) {
    const implementation = await deploy('src/NullisPool.sol', 'NullisPool', [await asset.getAddress(), configuration]);
    const proxy = await deploy('src/NullisPoolProxy.sol', 'NullisPoolProxy', [await implementation.getAddress(), 'NULLIS local test', 'nTEST', verifiers]);
    return {pool: new Contract(await proxy.getAddress(), poolArtifact.abi, signer), implementation};
  }
  const asset = await deploy('test/Fixtures.sol', 'TestAsset');
  const {pool, implementation} = await makePool(asset), address = await pool.getAddress();
  assert.equal(await pool.owner(), ZeroAddress); assert.equal(await pool.pendingOwner(), ZeroAddress);
  assert.equal(await pool.backingAsset(), await asset.getAddress()); assert.equal(await pool.decimals(), 6n);
  checks.push('atomic initialization binds asset and verifier configuration, preserves asset decimals, and leaves no owner');
  for (const actor of [signer, attacker]) await reject(() => pool.connect(actor).mint.staticCall([123n], '0x'), 'UnbackedMintDisabled', pool.interface);
  checks.push('deployer and attacker cannot mint unbacked notes');
  await reject(()=>pool.transfer.staticCall([0,0],[0,0],'0x','0x'),'PrivateTransfersUnavailable',pool.interface);
  checks.push('unreviewed legacy private-transfer entry point is disabled independently of verifier configuration');
  await reject(() => pool.initialize.staticCall('bad', 'BAD', ZeroAddress, verifiers), 'InvalidInitialization', pool.interface);
  await reject(() => implementation.initialize.staticCall('bad', 'BAD', ZeroAddress, verifiers), 'InvalidInitialization', pool.interface);
  checks.push('proxy cannot reinitialize and implementation is locked');
  await reject(() => pool.upgradeToAndCall.staticCall(implementation.target, '0x'), 'Error', pool.interface);
  await reject(() => pool.transferOwnership.staticCall(awaitAddress(attacker)), 'OwnableUnauthorizedAccount', pool.interface);
  await reject(() => pool.setERC20.staticCall(asset.target), 'OwnableUnauthorizedAccount', pool.interface);
  checks.push('upgrade, ownership takeover and backing-token replacement fail');
  await reject(() => pool.createLock.staticCall('0x', '0x' + '00'.repeat(32), '0x' + '00'.repeat(32), '0x'), 'NullisLockingDisabled', pool.interface);
  await reject(() => pool.withdraw.staticCall(amount, [0, 0], 0, '0x', '0x'), 'InvalidWithdrawalShape', pool.interface);
  checks.push('unused lock routes and empty withdrawal inputs fail closed');
  await (await asset.approve(address, amount)).wait();
  await reject(() => pool.deposit.staticCall(amount, [...commitments, 999n], encodedProof, '0x'), 'InvalidDepositShape', pool.interface);
  await reject(() => pool.deposit.staticCall(0, commitments, encodedProof, '0x'), 'InvalidDepositShape', pool.interface);
  checks.push('deposits cannot append unproven commitments or use an empty amount');
  await reject(() => pool.deposit.staticCall(amount + 1n, commitments, encodedProof, '0x'), 'InvalidProof', pool.interface);
  assert.equal(await pool.getRoot(), 0n); assert.equal(await asset.balanceOf(address), 0n);
  checks.push('altered deposit amount is rejected by the actual generated Groth16 verifier');
  await (await pool.deposit(amount, commitments, encodedProof, '0x', {gasLimit: 10000000})).wait();
  assert.equal(await asset.balanceOf(address), amount); assert.notEqual(await pool.getRoot(), 0n);
  assert.equal(await asset.balanceOf(await signer.getAddress()), 1_000_000_000n - amount);
  checks.push('fresh proof deposits actual test ERC20 tokens and adds commitments to a real Poseidon sparse Merkle tree');
  await reject(() => pool.deposit.staticCall(amount, commitments, encodedProof, '0x'), 'UTXOAlreadyOwned', pool.interface);
  assert.equal(await asset.balanceOf(address), amount);
  checks.push('duplicate commitments cannot be deposited again');
  const storeAddress = await pool.noteStore();
  const store = new Contract(storeAddress, output.contracts['zeto/lib/storage/nullifier.sol'].NullifierStorage.abi, attacker);
  await reject(() => store.processOutputs.staticCall([999n]), 'StorageUnauthorized', store.interface);
  checks.push('external accounts cannot mutate the note store directly');
  const feeAsset = await deploy('test/Fixtures.sol', 'TestAsset'), {pool: feePool} = await makePool(feeAsset);
  await (await feeAsset.setFee(true)).wait(); await (await feeAsset.approve(feePool.target, amount)).wait();
  await reject(() => feePool.deposit.staticCall(amount, commitments, encodedProof, '0x'), 'IncorrectAssetMovement', feePool.interface);
  await assert.rejects(async () => (await feePool.deposit(amount, commitments, encodedProof, '0x', {gasLimit: 10000000})).wait());
  assert.equal(await feePool.getRoot(), 0n); assert.equal(await feeAsset.balanceOf(feePool.target), 0n); assert.equal(await feeAsset.totalSupply(), 1_000_000_000n);
  checks.push('fee-on-transfer deposits revert atomically without unbacked notes or a token burn');
  await (await feeAsset.setFee(false)).wait(); await (await feeAsset.setReturnsFalse(true)).wait();
  await reject(() => feePool.deposit.staticCall(amount, commitments, encodedProof, '0x'), 'SafeERC20FailedOperation', feePool.interface);
  await assert.rejects(async () => (await feePool.deposit(amount, commitments, encodedProof, '0x', {gasLimit: 10000000})).wait());
  assert.equal(await feePool.getRoot(), 0n);
  await (await feeAsset.setReturnsFalse(false)).wait();
  await (await feeAsset.setCallback(feePool.target, feePool.interface.encodeFunctionData('deposit', [amount, commitments, encodedProof, '0x']))).wait();
  await (await feePool.deposit(amount, commitments, encodedProof, '0x', {gasLimit: 10000000})).wait();
  assert.equal(await feeAsset.callbackSucceeded(), false);
  assert.equal(await feeAsset.callbackFailure(), id('ReentrancyGuardReentrantCall()').slice(0, 10));
  assert.equal(await feeAsset.balanceOf(feePool.target), amount);
  checks.push('failed ERC20 transfer rolls back notes; the same proof can be retried, and a reentrant deposit is rejected');
  const withdrawal = await testWithdrawals({root,prover,pool,feePool,asset,signer,attacker,provider,store,reject,generated:withdrawalGenerated,checks});
  const report = {checkedAt: new Date().toISOString(), compiler: solc.version(), runtimeBytes, maximumRuntimeBytes: 24576,
    checks, passed: true, localOnly: true, testAssetOnly: true, realDepositProof: true, withdrawalImplemented: true, withdrawalProofTested: true,withdrawal,
    transferProofTested: false, mainnetDeployment: false, sourceProvenance: output.nullis};
  writeFileSync(resolve(root, 'artifacts/validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({...report, sourceProvenance: undefined}, null, 2));
} finally {await provider.destroy(); await eip1193.disconnect();}

// Ethers accepts a promise as an address argument; no account secret is read.
function awaitAddress(account) {return account.getAddress();}
