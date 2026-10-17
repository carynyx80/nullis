import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import solc from 'solc';
import {adapt} from './patches.mjs';
import {createHash} from 'node:crypto';
export const root = dirname(fileURLToPath(import.meta.url));
export const zetoPin = 'dd495492f540c5f71988d15f8d3eb2b0d93c5099';
export const iden3Pin = '99df49220beefed176a1d4f8472ba1cf5f94e367';
function validateReferences() {
  for (const [folder, sha] of [['zeto-upstream', zetoPin], ['iden3-upstream', iden3Pin]]) {
    const cwd = resolve(root, '../research', folder);
    const sourcePath = folder === 'zeto-upstream' ? 'solidity/contracts' : 'contracts';
    if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8'}).trim() !== sha || execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', sourcePath], {cwd, encoding: 'utf8'}).trim()) throw Error('Expected clean pinned upstream source: ' + folder);
  }
}
function sourceRoots(extra) {
  const sources = Object.fromEntries(['src/NullisPool.sol', 'src/NullisPoolProxy.sol', 'src/WithdrawalVerifierAdapter.sol'].map(path => [path, {content: readFileSync(resolve(root, path), 'utf8')}]));
  Object.assign(sources, extra);
  return sources;
}
function readImport(path) {
  const mappings = [['zeto/', resolve(root, '../research/zeto-upstream/solidity/contracts')], ['@iden3/contracts/', resolve(root, '../research/iden3-upstream')], ['@openzeppelin/', resolve(root, 'node_modules/@openzeppelin')]];
  const entry = mappings.find(([prefix]) => path.startsWith(prefix));
  if (!entry) throw Error('Unapproved import');
  const target = resolve(entry[1], path.slice(entry[0].length));
  if (!target.startsWith(entry[1] + sep)) throw Error('Import outside source root');
  return readFileSync(target, 'utf8');
}
const digest = text => createHash('sha256').update(text).digest('hex');
function fingerprint(sources) {
  return digest(JSON.stringify({sources, compiler: solc.version(), compileScript: readFileSync(fileURLToPath(import.meta.url), 'utf8'), patches: readFileSync(resolve(root, 'patches.mjs'), 'utf8')}));
}
export function compile(extra = {}) {
  validateReferences();
  const sources = sourceRoots(extra);
  const sourceHashes = Object.fromEntries(Object.entries(sources).map(([path, value]) => [path, {compiled: createHash('sha256').update(value.content).digest('hex'), adapted: false}]));
  const fullOutput = ['abi', 'evm.bytecode', 'evm.deployedBytecode'];
  const selection = {'*': {'*': ['abi']}};
  for (const path of [...Object.keys(sources), '@iden3/contracts/contracts/lib/SmtLib.sol', '@iden3/contracts/contracts/lib/ArrayUtils.sol']) selection[path] = {'*': fullOutput};
  const output = JSON.parse(solc.compile(JSON.stringify({language: 'Solidity', sources, settings: {
    optimizer: {enabled: true, runs: 1}, viaIR: true, evmVersion: 'shanghai',
    outputSelection: selection
  }}), {import(path) {
    try {
      const original = readImport(path), contents = adapt(path, original);
      sourceHashes[path] = {original: createHash('sha256').update(original).digest('hex'), compiled: createHash('sha256').update(contents).digest('hex'), adapted: contents !== original};
      return {contents};
    } catch {return {error: 'Missing pinned dependency: ' + path};}
  }}));
  const errors = output.errors?.filter(error => error.severity === 'error');
  if (errors?.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  output.nullis = {sourceHashes, zetoPin, iden3Pin, fingerprint: fingerprint(sources)};
  return output;
}
export function compileCached(extra = {}) {
  validateReferences();
  const sources = sourceRoots(extra), path = resolve(root, 'artifacts/compiled.json');
  if (existsSync(path)) {
    const cached = JSON.parse(readFileSync(path));
    if (cached.nullis?.fingerprint === fingerprint(sources) && Object.entries(cached.nullis.sourceHashes).every(([name, hashes]) => digest(sources[name]?.content ?? adapt(name, readImport(name))) === hashes.compiled)) {
      console.log('Using compiled artifacts with matching source, dependency and compiler hashes');
      return cached;
    }
  }
  const output = compile(extra); mkdirSync(resolve(root, 'artifacts'), {recursive: true});
  writeFileSync(path, JSON.stringify(output)); return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = compile();
  mkdirSync(resolve(root, 'artifacts'), {recursive: true});
  writeFileSync(resolve(root, 'artifacts/compiled.json'), JSON.stringify(output));
  const pool = output.contracts['src/NullisPool.sol'].NullisPool;
  const bytes = pool.evm.deployedBytecode.object.length / 2;
  console.log(JSON.stringify({compiler: solc.version(), runtimeBytes: bytes, maximumRuntimeBytes: 24576, withinSizeLimit: bytes <= 24576, mainnetReady: false, withdrawalImplemented: true}));
  if (bytes > 24576) process.exitCode = 1;
}
