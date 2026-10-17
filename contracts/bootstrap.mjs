import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const references = JSON.parse(readFileSync(resolve(root, 'references.json')));
function git(cwd, ...args) {return execFileSync('git', ['-c', 'http.sslBackend=openssl', ...args], {cwd, encoding: 'utf8'}).trim();}
for (const reference of Object.values(references)) {
  const target = resolve(root, '../research', reference.directory);
  if (!existsSync(target)) {
    git(root, 'clone', '--filter=blob:none', '--no-checkout', reference.repository, target);
    git(target, 'fetch', '--depth=1', 'origin', reference.commit);
    git(target, 'sparse-checkout', 'set', ...reference.paths);
    git(target, 'checkout', '--detach', reference.commit);
  }
  if (git(target, 'rev-parse', 'HEAD') !== reference.commit) throw Error('Preserve existing checkout; expected another pinned reference: ' + reference.directory);
  const sourcePath = reference.directory === 'zeto-upstream' ? 'solidity/contracts' : 'contracts';
  if (git(target, 'status', '--porcelain', '--untracked-files=no', '--', sourcePath)) throw Error('Pinned source is modified: ' + reference.directory);
}
console.log('Pinned contract sources are available. Existing checkouts were not reset.');
