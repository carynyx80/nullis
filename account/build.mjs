import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('./package.json',import.meta.url));
const solc=require('solc');
export const accountRoot=dirname(fileURLToPath(import.meta.url));
export function build(extra = {}) {
 const source=readFileSync(resolve(accountRoot,'PublicAccount.sol'),'utf8');
 const settings={optimizer:{enabled:true,runs:200},evmVersion:'shanghai',viaIR:true,outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}};
 const input={language:'Solidity',sources:{'PublicAccount.sol':{content:source},...extra},settings};
 const dependencies={};
 const output=JSON.parse(solc.compile(JSON.stringify(input),{import(name){
  if(!name.startsWith('@openzeppelin/contracts/')||name.includes('..'))throw Error('Unexpected import');
  const content=readFileSync(resolve(accountRoot,'node_modules',name),'utf8');dependencies[name]={content};return {contents:content};
 }}));
 const errors=output.errors?.filter(e=>e.severity==='error');if(errors?.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 const contract=output.contracts['PublicAccount.sol'].NullispadPublicAccount;
 const report={compiler:solc.version(),sourceSha256:createHash('sha256').update(source).digest('hex'),...contract,
  input:{...input,sources:{...input.sources,...dependencies}},runtimeBytes:contract.evm.deployedBytecode.object.length/2};
 if(report.runtimeBytes>24576)throw Error('Contract too large');
 mkdirSync(resolve(accountRoot,'artifacts'),{recursive:true});if(Object.keys(extra).length===0)writeFileSync(resolve(accountRoot,'artifacts/account.json'),JSON.stringify(report,null,2)+'\n');
 return {...report,contracts:output.contracts};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=build();console.log(JSON.stringify({compiler:a.compiler,runtimeBytes:a.runtimeBytes,sourceSha256:a.sourceSha256}));}
