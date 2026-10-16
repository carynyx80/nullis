import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const assets={};const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
for(const item of await readdir('dist',{withFileTypes:true})){if(!item.isFile()||!types[path.extname(item.name)])continue;assets['/'+item.name]={type:types[path.extname(item.name)],body:(await readFile('dist/'+item.name)).toString('base64')}}
const core=(await readFile('dist/registry-core.js','utf8')).replace("if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NullisRegistryCore=api;",'root.NullisRegistryCore=api;');
const handler=(await readFile('registry/handler.mjs','utf8')).replace("import Core from '../dist/registry-core.js';",'').replace('export async function handleRegistry','async function handleRegistry');
const worker=(await readFile('worker/index.mjs','utf8')).replace("import {handleRegistry} from '../registry/handler.mjs';",'').replace('/*__ASSETS__*/{}',JSON.stringify(assets));
const source=core+'\nconst Core=globalThis.NullisRegistryCore;\n'+handler+'\n'+worker;
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',source);
await mkdir('dist/.openai',{recursive:true});await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Worker with '+Object.keys(assets).length+' assets and durable username API.');
