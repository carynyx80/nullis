import {existsSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const artifacts = new URL('./artifacts/', import.meta.url);
mkdirSync(artifacts, {recursive: true});
if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log('Using the pinned WASI compiler package on this platform.');
} else {
  const target = new URL('circom-windows-amd64.exe', artifacts);
  if (!existsSync(target)) {
    const response = await fetch('https://github.com/iden3/circom/releases/download/v2.2.2/circom-windows-amd64.exe', {signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw Error('Official compiler download failed');
    writeFileSync(target, new Uint8Array(await response.arrayBuffer()));
  }
  const digest = createHash('sha256').update(readFileSync(target)).digest('hex');
  if (digest !== 'e976b5e83b1627fcdc3ab173ef6d6b3253332dd957d2fb834c098ea246d2ead1') throw Error('Compiler checksum mismatch');
  const {fileURLToPath} = await import('node:url');
  const version = execFileSync(fileURLToPath(target), ['--version'], {encoding: 'utf8'}).trim();
  if (version !== 'circom compiler 2.2.2') throw Error('Unexpected compiler version');
  console.log(JSON.stringify({version, sha256: digest, source: 'official iden3/circom v2.2.2 release'}));
}
