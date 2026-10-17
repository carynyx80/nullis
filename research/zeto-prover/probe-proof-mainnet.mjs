// eth_call with ephemeral code overrides only; never signs or deploys a contract.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import solc from 'solc';
import {Interface} from 'ethers';
import {groth16} from 'snarkjs';
const cwd = fileURLToPath(new URL('.', import.meta.url));
const artifact = name => fileURLToPath(new URL('./artifacts/' + name, import.meta.url));
const local = JSON.parse(readFileSync(artifact('results.json')));
if (!local.passed || !local.localOnly || local.productionSetup) throw Error('Expected passing local-only proof experiment');
execFileSync(process.execPath, [fileURLToPath(new URL('./node_modules/snarkjs/cli.js', import.meta.url)), 'zkey', 'export', 'solidityverifier', artifact('UNSAFE-LOCAL-ONLY.zkey'), artifact('LocalVerifier.sol')], {cwd});
const source = readFileSync(artifact('LocalVerifier.sol'), 'utf8');
const output = JSON.parse(solc.compile(JSON.stringify({language: 'Solidity', sources: {'LocalVerifier.sol': {content: source}}, settings: {optimizer: {enabled: true, runs: 200}, outputSelection: {'*': {'*': ['abi', 'evm.deployedBytecode.object']}}}})));
if (output.errors?.some(error => error.severity === 'error')) throw Error('Verifier compilation failed');
const contract = Object.values(output.contracts['LocalVerifier.sol'])[0];
const code = '0x' + contract.evm.deployedBytecode.object;
const iface = new Interface(contract.abi);
const proof = JSON.parse(readFileSync(artifact('proof.json'))), signals = JSON.parse(readFileSync(artifact('public.json')));
const args = JSON.parse('[' + await groth16.exportSolidityCallData(proof, signals) + ']');
let id = 0;
const url = process.env.NULLIS_MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com';
async function request(method, params = []) {
  if (!['eth_chainId', 'eth_blockNumber', 'eth_getCode', 'eth_call'].includes(method)) throw Error('Read-only methods required');
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, params}), signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('RPC request failed');
  const body = await response.json();
  if (body.error || !('result' in body)) throw Error('Provider rejected call or code override');
  return body.result;
}
const report = {checkedAt: new Date().toISOString(), mode: 'mainnet eth_call with ephemeral code override', transactionsSent: 0,
  contractsDeployed: false, productionSetup: false, verifierRuntimeSha256: createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex')};
try {
  if (Number(BigInt(await request('eth_chainId'))) !== 4663) throw Error('Wrong chain');
  const block = await request('eth_blockNumber');
  // This address must have no persistent code; override exists only for each call.
  const to = '0x000000000000000000000000000000004e554c4c';
  if (await request('eth_getCode', [to, block]) !== '0x') throw Error('Probe address already has code');
  const call = async inputs => {
    const result = await request('eth_call', [{to, data: iface.encodeFunctionData('verifyProof', inputs), gas: '0x989680'}, block, {[to]: {code}}]);
    return iface.decodeFunctionResult('verifyProof', result)[0];
  };
  const valid = await call(args);
  const changed = structuredClone(args); changed[3][0] = (BigInt(changed[3][0]) + 1n).toString();
  const invalid = await call(changed);
  if (Number(BigInt(await request('eth_chainId'))) !== 4663) throw Error('Network changed');
  Object.assign(report, {chainId: 4663, block, freshProofAccepted: valid, alteredAmountRejected: invalid === false, passed: valid === true && invalid === false});
} catch {
  // Do not expose custom provider URLs, keys or response bodies.
  Object.assign(report, {passed: false, status: 'unverified', reason: 'Mainnet verification call unavailable, rejected, or wrong network'});
}
writeFileSync(artifact('mainnet-proof-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
