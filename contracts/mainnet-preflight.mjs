// Read-only: never imports a signer, generates a deployment key, or sends a transaction.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Interface, getAddress, keccak256, formatEther} from 'ethers';
import {root} from './compile.mjs';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const artifacts = resolve(root, 'artifacts'), prover = resolve(root, '../research/zeto-prover/artifacts');
const url = process.env.NULLIS_MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com';
const asset = getAddress(process.env.NULLIS_ASSET || '0x0bd7d308f8e1639fab988df18a8011f41eacad73');
const deployer = process.env.NULLIS_DEPLOYER ? getAddress(process.env.NULLIS_DEPLOYER) : null;
const report = {checkedAt: new Date().toISOString(), chainId: 4663, mode: 'read-only eth_call with ephemeral verifier code',
  transactionsSent: 0, contractsDeployed: false, productionReady: false, checks: [], blockers: []};
let nextId = 0;
async function rpc(method, params = []) {
  assert.ok(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_gasPrice'].includes(method));
  let response;
  try {
    response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:++nextId,method,params}),signal:AbortSignal.timeout(20000)});
  } catch {throw Error('RPC transport unavailable');}
  if (!response.ok) throw Error('RPC HTTP failure');
  const body = await response.json();
  if (body.error || body.result === undefined) throw Error('RPC method rejected: ' + method);
  return body.result;
}
try {
  const validation = json(resolve(artifacts,'validation.json')), compiled = json(resolve(artifacts,'compiled.json'));
  assert.ok(validation.passed && validation.localOnly && validation.withdrawalProofTested && !validation.mainnetDeployment);
  for (const [name, entry] of Object.entries(compiled.nullis.sourceHashes)) {
    if (name.startsWith('src/')) assert.equal(sha(resolve(root,name)),entry.compiled,'Stale compiled pool source');
  }
  assert.equal(sha(resolve(prover,'WithdrawalVerifier.sol')),compiled.nullis.sourceHashes['test/WithdrawalVerifier.sol'].compiled);
  const setup = json(resolve(prover,'withdrawal-setup.json'));
  assert.equal(setup.wrapperHash,sha(resolve(root,'../research/zeto-prover/circuits/withdrawal.circom')));
  assert.equal(setup.circuitHash,sha(resolve(prover,'withdrawal.r1cs')));
  assert.equal(setup.keyHash,sha(resolve(prover,'UNSAFE-WITHDRAWAL-LOCAL-ONLY.zkey')));
  assert.equal(setup.wasmHash,sha(resolve(prover,'withdrawal_js/withdrawal.wasm')));
  report.checks.push('Local proof, circuit, verifier and pool artifacts match current sources');
  assert.equal(BigInt(await rpc('eth_chainId')),4663n,'Wrong network');
  const block = await rpc('eth_blockNumber'), header = await rpc('eth_getBlockByNumber',[block,false]);
  assert.ok(header?.hash && BigInt(header.number)===BigInt(block),'Missing block header');
  const age = Math.floor(Date.now()/1000)-Number(BigInt(header.timestamp));
  assert.ok(age>=-120 && age<=600,'RPC latest block is stale');
  report.block = {number:BigInt(block).toString(),hash:header.hash,timestamp:Number(BigInt(header.timestamp))};
  report.checks.push('RPC reports Robinhood mainnet and a recent block');
  const code = await rpc('eth_getCode',[asset,block]); assert.notEqual(code,'0x','Asset has no code');
  const erc20 = new Interface(['function symbol() view returns (string)','function decimals() view returns (uint8)','function totalSupply() view returns (uint256)']);
  const values = await Promise.all(['symbol','decimals','totalSupply'].map(async name => erc20.decodeFunctionResult(name,
    await rpc('eth_call',[{to:asset,data:erc20.encodeFunctionData(name)},block]))[0]));
  report.asset = {address:asset,symbol:values[0],decimals:Number(values[1]),totalSupply:values[2].toString(),runtimeKeccak256:keccak256(code),issuerBehaviorReviewed:false};
  report.checks.push('Candidate backing asset has code and readable ERC20 metadata (not a token safety approval)');
  if (deployer) {
    const [balance,gasPrice] = await Promise.all([rpc('eth_getBalance',[deployer,block]),rpc('eth_gasPrice')]);
    report.deployer = {address:deployer,balanceWei:BigInt(balance).toString(),balanceETH:formatEther(balance),gasPriceWei:BigInt(gasPrice).toString()};
    if (BigInt(balance)===0n) report.blockers.push('Deployment wallet has no ETH on Robinhood Chain');
    const runtimeBytes=compiled.contracts['src/NullisPool.sol'].NullisPool.evm.deployedBytecode.object.length/2;
    assert.ok(Number.isInteger(runtimeBytes)&&runtimeBytes<=24576);
    const codeDepositGas=BigInt(runtimeBytes)*200n, codeDepositCost=codeDepositGas*BigInt(gasPrice);
    report.gasLowerBound={poolRuntimeBytes:runtimeBytes,implementationCodeDepositGas:codeDepositGas.toString(),
      implementationCodeDepositAtCurrentGasPriceWei:codeDepositCost.toString(),
      excludes:'Constructors, libraries, verifiers, adapters, proxy, calldata and L1 data fees; not a deployment quote'};
    if(BigInt(balance)<codeDepositCost)report.blockers.push('Wallet balance is below the pool implementation code-deposit cost at the current gas price; full deployment needs more');
  } else report.blockers.push('Deployment wallet public address is missing');
  const generated = compiled.contracts['test/WithdrawalVerifier.sol'].Groth16Verifier;
  const verifierCode = '0x'+generated.evm.deployedBytecode.object, iface = new Interface(generated.abi);
  assert.ok(!verifierCode.includes('__'),'Verifier has unresolved libraries');
  const to = '0x000000000000000000000000000000004e554c4c';
  assert.equal(await rpc('eth_getCode',[to,block]),'0x','Probe address is occupied');
  report.verifierRuntimeKeccak256 = keccak256(verifierCode);
  report.proofs = [];
  for (const name of ['partial','full']) {
    const proof = json(resolve(artifacts,name+'-withdrawal-proof.json'));
    const signals = json(resolve(artifacts,name+'-withdrawal-public.json'));
    assert.equal(signals.length,8);
    const args = [proof.pi_a.slice(0,2),[proof.pi_b[0].slice(0,2).reverse(),proof.pi_b[1].slice(0,2).reverse()],proof.pi_c.slice(0,2)];
    async function verify(inputs) {
      const encoded = iface.encodeFunctionData('verifyProof',[...args,inputs]);
      const result = await rpc('eth_call',[{to,data:encoded,gas:'0x989680'},block,{[to]:{code:verifierCode}}]);
      return iface.decodeFunctionResult('verifyProof',result)[0];
    }
    assert.equal(await verify(signals),true,'Valid local proof rejected on mainnet EVM');
    for (let index=0;index<8;index++) {
      const changed = [...signals]; changed[index]=(BigInt(changed[index])+1n).toString();
      assert.equal(await verify(changed),false,'Changed public signal accepted');
    }
    report.proofs.push({fixture:name,accepted:true,changedSignalsRejected:8,contextOrigin:'locally generated fixture; verifier arithmetic check only, no mainnet settlement'});
  }
  assert.equal(BigInt(await rpc('eth_chainId')),4663n);
  assert.equal((await rpc('eth_getBlockByNumber',[block,false])).hash,header.hash,'Block changed during preflight');
  report.checks.push('Mainnet EVM accepts partial/full test proofs and rejects changes to all eight public signals');
  report.blockers.push('Both proof systems still use local test-only circuit setup; independent production setup verification is missing',
    'Independent circuit and contract security review is missing',
    'Client spending-key recovery, encrypted note discovery and financial transaction integration are incomplete',
    'Supported asset transfer behavior and complete linked deployment artifacts need verification');
  report.passed = true;
} catch (error) {
  report.passed = false;
  // Never serialize provider URLs, request bodies, witnesses, or raw provider exceptions.
  report.failure = error?.code==='ERR_ASSERTION' ? String(error.message).split('\n')[0] : 'Preflight unavailable; inspect local artifacts and RPC access';
}
writeFileSync(resolve(artifacts,'mainnet-preflight.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (!report.passed) process.exitCode=1;
