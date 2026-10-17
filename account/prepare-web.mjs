import {readFileSync,writeFileSync,copyFileSync,existsSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {accountRoot} from './build.mjs';
import {NETWORK} from './network.mjs';
const {keccak256}=createRequire(new URL('./package.json',import.meta.url))('ethers');
const artifact=JSON.parse(readFileSync(resolve(accountRoot,'artifacts/account.json')));
const network=JSON.parse(readFileSync(resolve(accountRoot,'artifacts/network.json')));
if(!network.passed)throw Error('Passing network probe required');
const runtime=artifact.evm.deployedBytecode;
const deploymentPath=resolve(accountRoot,'deployment.json');
let defaultAccount=null;
if(existsSync(deploymentPath)){const d=JSON.parse(readFileSync(deploymentPath));if(!d.verified||d.chainId!==4663||d.sourceSha256!==artifact.sourceSha256)throw Error('Deployment record does not match the current contract');defaultAccount=d.address;}
const config={network:NETWORK,hashes:network.hashes,abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,
 runtimeHash:keccak256('0x'+runtime.object),immutableReferences:Object.values(runtime.immutableReferences).flat(),
 sourceSha256:artifact.sourceSha256,compiler:artifact.compiler,defaultAccount};
writeFileSync(resolve(accountRoot,'../dist/account-config.js'),'// Generated public account artifact. Public beta; no privacy claim.\nglobalThis.NullispadAccountConfig='+JSON.stringify(config)+';\n');
copyFileSync(resolve(accountRoot,'node_modules/ethers/dist/ethers.umd.min.js'),resolve(accountRoot,'../dist/chain-core.js'));
const licenses=[['ethers','LICENSE.md'],['@adraffy/ens-normalize','LICENSE'],['@noble/curves','LICENSE'],['@noble/hashes','LICENSE'],['aes-js','LICENSE.txt'],['tslib','LICENSE.txt']];
for(const [name,file] of licenses){const content=readFileSync(resolve(accountRoot,'node_modules',name,file),'utf8').replaceAll('*/','* /');appendFileSync(resolve(accountRoot,'../dist/chain-core.js'),'\n/* Bundled '+name+' license:\n'+content+'\n*/\n');}
writeFileSync(resolve(accountRoot,'verification-input.json'),JSON.stringify(artifact.input,null,2)+'\n');
console.log('Prepared pinned ethers 6.13.1 browser runtime and public account ABI/bytecode');
