// Limit the compiler's WASI filesystem to this research package.
const fs = require('node:fs');
const {WASI} = require('node:wasi');
const wasi = new WASI({version: 'preview1', args: ['circom2', ...process.argv.slice(2)],
  env: {}, preopens: {'.': process.cwd()}, returnOnExit: true});
WebAssembly.instantiate(fs.readFileSync(require.resolve('circom2/circom.wasm')), {wasi_snapshot_preview1: wasi.wasiImport})
  .then(({instance}) => {process.exitCode = wasi.start(instance);}).catch(error => {
  console.error(error); process.exitCode = 1;
});
