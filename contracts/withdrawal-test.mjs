// Local test utilities; not browser key management or a production wallet.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {AbiCoder, keccak256, ZeroAddress, id} from 'ethers';
import {poseidon3, poseidon4} from 'poseidon-lite';
import {createRequire} from 'node:module';
const {Merkletree, InMemoryDB, str2Bytes, ZERO_HASH} = createRequire(import.meta.url)('@iden3/js-merkletree');

export async function testWithdrawals({root, prover, pool, feePool, asset, signer, attacker, provider, store, reject, generated, checks}) {
  const coder = AbiCoder.defaultAbiCoder(), artifacts = resolve(root, 'artifacts');
  const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const deposit = JSON.parse(readFileSync(resolve(prover, 'input.json')));
  const publicValues = JSON.parse(readFileSync(resolve(prover, 'public.json')));
  const privateKey = 1n; // Deposit fixture is explicitly the public Base8 test key.
  const owner = deposit.outputOwnerPublicKeys[0].map(BigInt);
  const notes = publicValues.slice(1).map((commitment, i) => ({commitment: BigInt(commitment), value: BigInt(deposit.outputValues[i]), salt: BigInt(deposit.outputSalts[i])}));
  const tree = new Merkletree(new InMemoryDB(str2Bytes('NULLIS local withdrawal')), true, 64);
  for (const note of notes) await tree.add(note.commitment, note.commitment);
  assert.equal((await tree.root()).bigInt(), await pool.getRoot(), 'JS and Solidity Poseidon trees must agree');
  const recipient = await (await provider.getSigner(2)).getAddress();
  const attackerAddress = await attacker.getAddress();
  const address = await pool.getAddress(), token = await asset.getAddress(), chainId = (await provider.getNetwork()).chainId;
  const domain = await pool.WITHDRAWAL_DOMAIN();
  function context({amount, nullifiers, output, changeData, payout = recipient, chain = chainId, contract = address, assetAddress = token}) {
    return BigInt(keccak256(coder.encode(['bytes32','uint256','address','address','address','uint256','uint256[]','uint256','bytes32'],
      [domain, chain, contract, assetAddress, payout, amount, nullifiers, output, keccak256(changeData)]))) % field;
  }
  async function cli(args, allowFailure = false) {
    const result = await new Promise((accept, fail) => {
      const child = spawn(process.execPath, [resolve(root, 'node_modules/snarkjs/cli.js'), ...args], {cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe']});
      let text = ''; child.stdout.on('data', b => {text += b.toString();}); child.stderr.on('data', b => {text += b.toString();});
      child.on('error', fail); child.on('exit', code => accept({code, text}));
    });
    if (!allowFailure && (result.code !== 0 || /\[ERROR\]/.test(result.text))) throw Error('Local proving tool failed: ' + result.text);
    return result;
  }
  const save = (name, value) => {const path = resolve(artifacts, name); writeFileSync(path, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)); return path;};
  async function makeWitness(inputNotes, change, changeData) {
    const selected = [...inputNotes]; while (selected.length < 2) selected.push({commitment: 0n, value: 0n, salt: 0n});
    const nullifiers = selected.map(note => note.commitment === 0n ? 0n : poseidon3([note.value, note.salt, privateKey]));
    const membership = await Promise.all(selected.map(note => tree.generateCircomVerifierProof(note.commitment, ZERO_HASH)));
    const amount = selected.reduce((s, n) => s + n.value, 0n) - change.value;
    const bound = context({amount, nullifiers, output: change.commitment, changeData});
    assert.equal(bound, await pool.withdrawalContext(amount, nullifiers, change.commitment, recipient, keccak256(changeData)));
    return {input: {nullifiers, inputCommitments: selected.map(n => n.commitment), inputValues: selected.map(n => n.value), inputSalts: selected.map(n => n.salt), inputOwnerPrivateKey: privateKey,
      root: (await tree.root()).bigInt(), merkleProof: membership.map(p => p.siblings.map(s => s.bigInt())), enabled: selected.map(n => n.commitment === 0n ? 0 : 1),
      outputCommitments: [change.commitment], outputValues: [change.value], outputSalts: [change.salt], outputOwnerPublicKeys: [owner], context: bound}, amount, nullifiers, changeData, change};
  }
  async function prove(name, packet) {
    console.log('Generating fresh ' + name + ' withdrawal proof');
    const inputPath = save(name + '-withdrawal-input.json', packet.input), proofPath = resolve(artifacts, name + '-withdrawal-proof.json'), publicPath = resolve(artifacts, name + '-withdrawal-public.json');
    await cli(['groth16','fullprove',inputPath,resolve(prover,'withdrawal_js/withdrawal.wasm'),resolve(prover,'UNSAFE-WITHDRAWAL-LOCAL-ONLY.zkey'),proofPath,publicPath]);
    await cli(['groth16','verify',resolve(prover,'withdrawal-verification-key.json'),publicPath,proofPath]);
    const proof = JSON.parse(readFileSync(proofPath)), signals = JSON.parse(readFileSync(publicPath));
    const expected = [packet.amount, ...packet.nullifiers, packet.input.root, ...packet.input.enabled, packet.change.commitment, packet.input.context].map(String);
    assert.deepEqual(signals, expected, 'Circuit and contract public signal ordering must match');
    const args = [proof.pi_a.slice(0,2), [proof.pi_b[0].slice(0,2).reverse(),proof.pi_b[1].slice(0,2).reverse()],proof.pi_c.slice(0,2)];
    return {...packet, args, signals, encodedProof: coder.encode(['uint256','tuple(uint256[2] pA,uint256[2][2] pB,uint256[2] pC)'],[packet.input.root,args]), data: coder.encode(['address','bytes'],[recipient,packet.changeData])};
  }
  const change = {value: 180n, salt: BigInt('0x' + randomBytes(30).toString('hex'))};
  change.commitment = poseidon4([change.value, change.salt, ...owner]);
  const partialWitness = await makeWitness(notes, change, '0x1234');
  const aliasKey = privateKey + 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
  const aliasPath = save('invalid-alternate-key.json', {...partialWitness.input, inputOwnerPrivateKey:aliasKey,
    nullifiers:notes.map(note=>poseidon3([note.value,note.salt,aliasKey]))});
  const aliasResult = await cli(['wtns','calculate',resolve(prover,'withdrawal_js/withdrawal.wasm'),aliasPath,resolve(artifacts,'invalid-key.wtns')],true);
  assert.ok(aliasResult.code!==0 && /Assert Failed|Error in template/.test(aliasResult.text),'Alternate representations of one owner key must be rejected');
  checks.push('noncanonical representations of an owner key cannot create fresh nullifiers for the same notes');
  const partial = await prove('partial', partialWitness);
  const call = (target, p, overrides = {}) => target.withdraw.staticCall(overrides.amount ?? p.amount, overrides.inputs ?? p.nullifiers, overrides.output ?? p.change.commitment, overrides.proof ?? p.encodedProof, overrides.data ?? p.data);
  await reject(() => call(pool, partial, {data: coder.encode(['address','bytes'],[attackerAddress, partial.changeData])}), 'InvalidProof', pool.interface);
  await reject(() => call(pool, partial, {data: coder.encode(['address','bytes'],[recipient,'0x1235'])}), 'InvalidProof', pool.interface);
  await reject(() => call(pool, partial, {amount: partial.amount + 1n}), 'InvalidProof', pool.interface);
  await reject(() => call(pool, partial, {output: partial.change.commitment + 1n}), 'InvalidProof', pool.interface);
  await reject(() => call(pool, partial, {proof: coder.encode(['uint256','tuple(uint256[2] pA,uint256[2][2] pB,uint256[2] pC)'],[partial.input.root + 1n, partial.args])}), 'UTXORootNotFound', store.interface);
  assert.equal(await feePool.getRoot(), partial.input.root);
  await reject(() => call(feePool, partial), 'InvalidProof', feePool.interface);
  checks.push('withdrawal proof rejects changed recipient, amount, change commitment/data, unknown root and replay into another token pool');
  for (const altered of [{chain: chainId + 1n}, {contract: feePool.target}, {assetAddress: ZeroAddress}]) {
    const signals = [...partial.signals]; signals[7] = context({...partial, output: partial.change.commitment, ...altered}).toString();
    assert.equal(await generated.verifyProof(...partial.args, signals), false);
  }
  checks.push('proof intent is bound to chain, pool and backing asset');
  await (await asset.setPayoutReturnsFalse(true)).wait();
  await reject(() => call(pool, partial), 'SafeERC20FailedOperation', pool.interface);
  await assert.rejects(async () => (await pool.withdraw(partial.amount,partial.nullifiers,partial.change.commitment,partial.encodedProof,partial.data,{gasLimit:10000000})).wait());
  assert.equal(await pool.getRoot(), partial.input.root); await store.validateInputs.staticCall(partial.nullifiers,false); assert.equal(await asset.balanceOf(address), 300n);
  await (await asset.setPayoutReturnsFalse(false)).wait(); await (await asset.setFee(true)).wait();
  await reject(() => call(pool, partial), 'IncorrectAssetMovement', pool.interface);
  await assert.rejects(async () => (await pool.withdraw(partial.amount,partial.nullifiers,partial.change.commitment,partial.encodedProof,partial.data,{gasLimit:10000000})).wait());
  assert.equal(await pool.getRoot(), partial.input.root); await store.validateInputs.staticCall(partial.nullifiers,false); assert.equal(await asset.totalSupply(), 1_000_000_000n);
  assert.equal(await asset.balanceOf(recipient), 0n);
  checks.push('failed or short withdrawal payouts atomically restore nullifiers, commitments and token balances');
  await (await asset.setFee(false)).wait();
  await (await asset.setCallback(address, pool.interface.encodeFunctionData('withdraw',[partial.amount,partial.nullifiers,change.commitment,partial.encodedProof,partial.data]))).wait();
  const partialReceipt = await (await pool.connect(attacker).withdraw(partial.amount,partial.nullifiers,change.commitment,partial.encodedProof,partial.data,{gasLimit:10000000})).wait();
  assert.equal(await asset.callbackSucceeded(), false); assert.equal(await asset.callbackFailure(), id('ReentrancyGuardReentrantCall()').slice(0,10));
  assert.equal(await asset.balanceOf(recipient), 120n); assert.equal(await asset.balanceOf(address), 180n);
  assert.equal(await asset.balanceOf(await attacker.getAddress()), 0n);
  for (const nullifier of partial.nullifiers) await reject(()=>store.validateInputs.staticCall([nullifier],false),'UTXOAlreadySpent',store.interface);
  await tree.add(change.commitment, change.commitment); assert.equal((await tree.root()).bigInt(), await pool.getRoot());
  await reject(() => call(pool, partial), 'UTXOAlreadySpent', pool.interface);
  checks.push('an untrusted relayer executes a 120-token withdrawal only to the proven recipient; reentrancy and double-spending are rejected');
  await (await asset.setCallback(ZeroAddress,'0x')).wait();
  const fullInput = await makeWitness([change], {commitment:0n,value:0n,salt:0n}, '0x');
  const badWitnesses = [
    {...fullInput.input,inputValues:[180n,7n]},
    {...fullInput.input,inputOwnerPrivateKey:2n},
    {...fullInput.input,enabled:[1,1]},
    {...fullInput.input,outputValues:[field-1n],outputSalts:[1n],outputCommitments:[poseidon4([field-1n,1n,...owner])]}
  ];
  for (let i=0;i<badWitnesses.length;i++) {
    const bad=save('invalid-withdrawal-'+i+'.json',badWitnesses[i]);
    const result=await cli(['wtns','calculate',resolve(prover,'withdrawal_js/withdrawal.wasm'),bad,resolve(artifacts,'invalid-withdrawal.wtns')],true);
    assert.ok(result.code!==0 && /Assert Failed|Error in template/.test(result.text),'Invalid withdrawal witness must fail constraints');
  }
  checks.push('circuit rejects value in an unused input, an incorrect spending key, false input flags and a negative-value change note');
  const full = await prove('full', fullInput);
  const fullReceipt = await (await pool.withdraw(full.amount,full.nullifiers,0,full.encodedProof,full.data,{gasLimit:10000000})).wait();
  assert.equal(await asset.balanceOf(address),0n); assert.equal(await asset.balanceOf(recipient),300n);
  assert.equal(await asset.balanceOf(await signer.getAddress()),1_000_000_000n-300n);
  await reject(()=>store.validateInputs.staticCall([full.nullifiers[0]],false),'UTXOAlreadySpent',store.interface);
  await reject(()=>call(pool,full),'UTXOAlreadySpent',pool.interface);
  checks.push('the remaining change note is fully withdrawn with one active input; vault ends empty and the full 300-token deposit is recovered');
  return {partialGas:partialReceipt.gasUsed.toString(),fullGas:fullReceipt.gasUsed.toString(),merkleDepth:64,productionSetup:false,encryptedDeliveryTested:false};
}
