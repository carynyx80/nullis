import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
// Only web assets are published: never local databases, Worker bundles or metadata.
await mkdir('public',{recursive:true});
const allowed=new Set(['.html','.css','.js','.svg','.png']);let count=0;
for(const entry of await readdir('dist',{withFileTypes:true})){
 if(!entry.isFile()||!allowed.has(path.extname(entry.name)))continue;
 if(entry.name==='index.html'){
  const html=await readFile('dist/index.html','utf8');
  await writeFile('public/index.html',html.replace('<script src="registry-core.js"></script>','<script>globalThis.NULLIS_CONFIG={usernameRegistry:false};</script><script src="registry-core.js"></script>'));
 }else await copyFile('dist/'+entry.name,'public/'+entry.name);
 count++;
}
console.log('Vercel build ready: '+count+' web assets. Global registration and financial transactions are disabled.');
