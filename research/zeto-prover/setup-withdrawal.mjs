// Generates a local-only circuit-specific setup. Not production ceremony keys.
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, createReadStream, createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const root = fileURLToPath(new URL('.', import.meta.url)), artifacts = resolve(root, 'artifacts');
const pin = 'dd495492f540c5f71988d15f8d3eb2b0d93c5099';
const upstream = resolve(root, '../zeto-upstream');
if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: upstream, encoding: 'utf8'}).trim() !== pin || execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'zkp/circuits'], {cwd: upstream, encoding: 'utf8'}).trim()) throw Error('Expected clean pinned circuit sources');
mkdirSync(artifacts, {recursive: true});
cpSync(resolve(upstream, 'zkp/circuits'), resolve(artifacts, 'circuits'), {recursive: true});
cpSync(resolve(root, 'node_modules/circomlib'), resolve(artifacts, 'circuits/node_modules/circomlib'), {recursive: true});
cpSync(resolve(root, 'circuits/withdrawal.circom'), resolve(artifacts, 'withdrawal.circom'));
async function run(tool, args) {
  const native = resolve(artifacts, 'circom-windows-amd64.exe');
  const useNative = tool === 'circom2' && process.platform === 'win32' && existsSync(native);
  const cli = tool === 'circom2' ? resolve(root, 'compile.cjs') : resolve(root, 'node_modules/snarkjs/cli.js');
  await new Promise((accept, reject) => {
    const child = spawn(useNative ? native : process.execPath, useNative ? args : [cli, ...args], {cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    let failed = false;
    const print = chunk => {const text = chunk.toString(); if (/\[ERROR\]/.test(text)) failed = true; process.stdout.write(text);};
    child.stdout.on('data', print); child.stderr.on('data', print); child.on('error', reject);
    child.on('exit', code => code === 0 && !failed ? accept() : reject(Error(tool + ' failed')));
  });
}
console.log('Compiling the full 64-level recipient-bound withdrawal circuit');
await run('circom2', ['artifacts/withdrawal.circom', '--O1', '--r1cs', '--wasm', '--sym', '-o', 'artifacts']);
const hashFile = async path => {const hash = createHash('blake2b512'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');};
const ptauName = 'powersOfTau28_hez_final_17', ptau = resolve(artifacts, ptauName + '.ptau');
const expected = JSON.parse(readFileSync(resolve(upstream, 'zkp/circuits/scripts/ptau_valid_hashes.json')))[ptauName];
if (!existsSync(ptau)) {
  console.log('Downloading phase-one parameters from the current snarkJS documentation host');
  const response = await fetch('https://circom.info/' + ptauName + '.ptau', {signal: AbortSignal.timeout(600000)});
  if (!response.ok) throw Error('Phase-one parameter download failed');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(ptau + '.part'));
  if (await hashFile(ptau + '.part') !== expected) throw Error('Phase-one parameter checksum mismatch');
  renameSync(ptau + '.part', ptau);
}
if (await hashFile(ptau) !== expected) throw Error('Phase-one parameter checksum mismatch');
const r1cs = resolve(artifacts, 'withdrawal.r1cs'), circuitHash = createHash('sha256').update(readFileSync(r1cs)).digest('hex');
const manifest = resolve(artifacts, 'withdrawal-setup.json'), key = resolve(artifacts, 'UNSAFE-WITHDRAWAL-LOCAL-ONLY.zkey');
const previous = existsSync(manifest) ? JSON.parse(readFileSync(manifest)) : null;
if (!previous || previous.circuitHash !== circuitHash || !existsSync(key) || previous.keyHash !== createHash('sha256').update(readFileSync(key)).digest('hex')) {
  console.log('Creating local-only withdrawal setup and contribution');
  const initial = resolve(artifacts, 'UNSAFE-withdrawal-initial.zkey');
  await run('snarkjs', ['groth16', 'setup', r1cs, ptau, initial]);
  await run('snarkjs', ['zkey', 'contribute', initial, key, '-n=NULLIS local testing only', '-e=' + randomBytes(64).toString('hex')]);
}
await run('snarkjs', ['zkey', 'verify', r1cs, ptau, key]);
await run('snarkjs', ['zkey', 'export', 'verificationkey', key, resolve(artifacts, 'withdrawal-verification-key.json')]);
await run('snarkjs', ['zkey', 'export', 'solidityverifier', key, resolve(artifacts, 'WithdrawalVerifier.sol')]);
const summary = {checkedAt: new Date().toISOString(), circuitHash, keyHash: createHash('sha256').update(readFileSync(key)).digest('hex'),
  wrapperHash: createHash('sha256').update(readFileSync(resolve(root,'circuits/withdrawal.circom'))).digest('hex'),
  wasmHash: createHash('sha256').update(readFileSync(resolve(artifacts,'withdrawal_js/withdrawal.wasm'))).digest('hex'),
  phaseOneBlake2b512: expected, upstreamCommit: pin, merkleDepth: 64, localOnly: true, productionSetup: false};
writeFileSync(manifest, JSON.stringify(summary, null, 2) + '\n');
console.log('Local-only withdrawal verifier and proving key are ready.');
