// Local research only. The generated setup MUST NOT be used on mainnet.
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {poseidon4} from 'poseidon-lite';

const cwd = fileURLToPath(new URL('.', import.meta.url));
const upstream = resolve(cwd, '../zeto-upstream');
const pin = 'dd495492f540c5f71988d15f8d3eb2b0d93c5099';
const git = (...args) => execFileSync('git', ['-C', upstream, ...args], {encoding: 'utf8'}).trim();
if (git('rev-parse', 'HEAD') !== pin || git('status', '--porcelain', '--untracked-files=no')) throw Error('Expected clean pinned Zeto checkout');
const artifacts = resolve(cwd, 'artifacts'); mkdirSync(artifacts, {recursive: true});
const source = resolve(artifacts, 'circuits');
cpSync(resolve(upstream, 'zkp/circuits'), source, {recursive: true});
cpSync(resolve(cwd, 'node_modules/circomlib'), resolve(source, 'node_modules/circomlib'), {recursive: true});
function run(tool, args, allowFailure = false) {
  const cli = tool === 'circom2' ? resolve(cwd, 'compile.cjs') : resolve(cwd, 'node_modules', tool, 'cli.js');
  const native = resolve(artifacts, 'circom-windows-amd64.exe');
  const useNative = tool === 'circom2' && process.platform === 'win32' && existsSync(native);
  const result = spawnSync(useNative ? native : process.execPath, useNative ? args : [cli, ...args],
    {cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 * 1024});
  if (result.error) throw result.error;
  if (/\[ERROR\]/.test((result.stdout || '') + (result.stderr || ''))) result.status = 1;
  if (!allowFailure && result.status !== 0) throw Error(result.stderr || result.stdout || tool + ' failed');
  return result;
}
console.log('Compiling pinned deposit circuit');
const compilerVersion = run('circom2', ['--version']).stdout.trim();
run('circom2', ['artifacts/circuits/deposit.circom', '--O0', '--r1cs', '--wasm', '--sym', '-o', 'artifacts']);
const ptau = resolve(artifacts, 'UNSAFE-LOCAL-CONTRIBUTED-13.ptau');
if (!existsSync(ptau) || statSync(ptau).size < 1024) {
  console.log('Creating UNSAFE LOCAL-ONLY setup parameters; no ceremony');
  const initial = resolve(artifacts, 'UNSAFE-initial-13.ptau');
  run('snarkjs', ['powersoftau', 'new', 'bn128', '13', initial]);
  const contributed = resolve(artifacts, 'UNSAFE-contributed-13.ptau');
  run('snarkjs', ['powersoftau', 'contribute', initial, contributed, '-n=Local research only', '-e=' + randomBytes(64).toString('hex')]);
  run('snarkjs', ['powersoftau', 'prepare', 'phase2', contributed, ptau]);
}
const ptauHash = createHash('blake2b512').update(readFileSync(ptau)).digest('hex');
run('snarkjs', ['powersoftau', 'verify', ptau]);
console.log('Creating LOCAL-ONLY proving key');
const key = resolve(artifacts, 'UNSAFE-LOCAL-ONLY.zkey');
const initialKey = resolve(artifacts, 'UNSAFE-initial.zkey');
run('snarkjs', ['groth16', 'setup', resolve(artifacts, 'deposit.r1cs'), ptau, initialKey]);
run('snarkjs', ['zkey', 'contribute', initialKey, key, '-n=Local research only', '-e=' + randomBytes(64).toString('hex')]);
run('snarkjs', ['zkey', 'verify', resolve(artifacts, 'deposit.r1cs'), ptau, key]);
const vkey = resolve(artifacts, 'verification-key.json');
run('snarkjs', ['zkey', 'export', 'verificationkey', key, vkey]);
const owner = [
  5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  16950150798460657717958625567821834550301663161624707787222815936182638968203n
];
const salts = [BigInt('0x' + randomBytes(30).toString('hex')), BigInt('0x' + randomBytes(30).toString('hex'))];
const values = [100n, 200n];
const commitments = values.map((value, i) => poseidon4([value, salts[i], ...owner]));
const input = {outputValues: values, outputSalts: salts, outputOwnerPublicKeys: [owner, owner], outputCommitments: commitments};
const save = (name, value) => {const path = resolve(artifacts, name); writeFileSync(path, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)); return path;};
const inputPath = save('input.json', input);
const proof = resolve(artifacts, 'proof.json'), signals = resolve(artifacts, 'public.json');
console.log('Generating a fresh proof');
run('snarkjs', ['groth16', 'fullprove', inputPath, resolve(artifacts, 'deposit_js/deposit.wasm'), key, proof, signals]);
run('snarkjs', ['groth16', 'verify', vkey, signals, proof]);
const publicValues = JSON.parse(readFileSync(signals));
if (publicValues.length !== 3 || publicValues[0] !== '300' || publicValues.slice(1).some((v, i) => v !== commitments[i].toString())) throw Error('Unexpected public signals');
const changed = save('changed-public.json', ['301', ...publicValues.slice(1)]);
function requireInvalidProof(signalsPath) {
  const result = run('snarkjs', ['groth16', 'verify', vkey, signalsPath, proof], true);
  if (result.status === 0 || !/Invalid proof/i.test((result.stdout || '') + (result.stderr || ''))) throw Error('Expected cryptographic rejection of altered public signals');
}
requireInvalidProof(changed);
const changedCommitment = save('changed-commitment.json', [publicValues[0], (BigInt(publicValues[1]) + 1n).toString(), publicValues[2]]);
requireInvalidProof(changedCommitment);
const bad = save('bad-input.json', {...input, outputValues: [101n, 200n]});
const rejectedWitness = run('snarkjs', ['wtns', 'calculate', resolve(artifacts, 'deposit_js/deposit.wasm'), bad, resolve(artifacts, 'invalid.wtns')], true);
if (rejectedWitness.status === 0 || !/Assert Failed|Error in template/.test((rejectedWitness.stdout || '') + (rejectedWitness.stderr || ''))) throw Error('Expected constraint rejection of mismatched commitment');
const report = {checkedAt: new Date().toISOString(), upstreamCommit: pin, sourceLicense: 'Apache-2.0',
  compilerVersion, wasmSha256: createHash('sha256').update(readFileSync(resolve(artifacts, 'deposit_js/deposit.wasm'))).digest('hex'),
  ptauBlake2b512: ptauHash, r1csSha256: createHash('sha256').update(readFileSync(resolve(artifacts, 'deposit.r1cs'))).digest('hex'),
  checks: ['fresh deposit proof verified', 'public amount and commitments matched', 'changed public amount rejected', 'changed public commitment rejected', 'mismatched commitment rejected'],
  passed: true, localOnly: true, productionSetup: false, contractsDeployed: false, transactionsSent: 0};
save('results.json', report); console.log(JSON.stringify(report, null, 2));
