import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory} from 'ethers';
import {probePrecompiles,SCALAR} from './precompiles.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),upstream=path.resolve(root,'../railgun-upstream'),pin=JSON.parse(fs.readFileSync(path.join(root,'upstream.json'),'utf8'));
function source(name){return fs.readFileSync(path.join(upstream,name),'utf8')}
function fixture(title){
 const file=source('test/logic/snark.ts'),marker="it('"+title+"'",start=file.indexOf('await snarkStub.verify(',file.indexOf(marker));if(file.indexOf(marker)<0||start<0)throw Error('Pinned fixture not found');
 const from=start+'await snarkStub.verify('.length;let depth=1,index=from;for(;index<file.length;index++){if(file[index]==='(')depth++;if(file[index]===')'&&!--depth)break}const argumentsText=file.slice(from,index);
 // Parse data-only object/array literals. Reject all executable expressions.
 const remaining=argumentsText.replace(/\b\d+n\b/g,'0').replace(/\b(?:artifactsIPFSHash|alpha1|beta2|gamma2|delta2|ic|x|y|a|b|c)\b/g,'').replace(/''/g,'').replace(/[\s\d{},:\[\]]/g,'');if(remaining)throw Error('Fixture contains non-data expressions');
 return vm.runInNewContext('['+argumentsText+']',Object.create(null),{timeout:100});
}
export async function verifyLocal(){
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim(),dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:upstream,encoding:'utf8'}).trim();if(head!==pin.commit||dirty)throw Error('Upstream source must match the pinned, unmodified commit.');
 const names=['contracts/logic/Globals.sol','contracts/logic/Snark.sol','contracts/teststubs/logic/SnarkStub.sol'],sources=Object.fromEntries(names.map(name=>[name,{content:source(name)}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
 const errors=output.errors?.filter(e=>e.severity==='error')||[];if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts[names[2]].SnarkStub;
 const evm=ganache.provider({chain:{chainId:46630,hardfork:'london'},logging:{quiet:true},wallet:{totalAccounts:1}});const provider=new BrowserProvider(evm);
 try{
  const checks=await probePrecompiles((method,params)=>evm.request({method,params}));
  const signer=await provider.getSigner(),contract=await new ContractFactory(artifact.abi,'0x'+artifact.evm.bytecode.object,signer).deploy();await contract.waitForDeployment();
  const valid=fixture('Should accept valid proofs'),invalid=fixture('Should reject invalid proofs');
  checks.push({name:'Pinned Groth16 valid-proof fixture accepted',passed:await contract.verify(...valid)});
  checks.push({name:'Pinned Groth16 invalid-proof fixture rejected',passed:!await contract.verify(...invalid)});
  checks.push({name:'Changed public input rejected',passed:!await contract.verify(valid[0],valid[1],[BigInt(valid[2][0])+1n])});
  let scalarRejected=false;try{await contract.verify(valid[0],valid[1],[SCALAR+1n])}catch{scalarRejected=true}checks.push({name:'Out-of-field public input rejected',passed:scalarRejected});
  let malformedRejected=false;try{await contract.verify(valid[0],{...valid[1],a:{x:1n,y:1n}},valid[2])}catch{malformedRejected=true}checks.push({name:'Malformed proof point rejected',passed:malformedRejected});
  const negated=await contract.negate({x:0n,y:0n});checks.push({name:'Point-at-infinity handling preserved',passed:negated[0]===0n&&negated[1]===0n});
  const gas=(await contract.verify.estimateGas(...valid)).toString();
  const report={milestone:'Groth16 verifier compatibility',environment:'local in-memory EVM only',configuredChainId:46630,upstreamCommit:head,compiler:solc.version(),sourceLicense:pin.sourceLicense,sourceHashes:Object.fromEntries([...names,'test/logic/snark.ts'].map(name=>[name,createHash('sha256').update(source(name)).digest('hex')])),runtimeBytes:artifact.evm.deployedBytecode.object.length/2,validProofGasEstimate:gas,checks,passed:checks.every(c=>c.passed),generatedNewProof:false,testnetDeployment:false,shieldedWalletImplemented:false};
  fs.writeFileSync(path.join(root,'local-results.json'),JSON.stringify(report,null,2));return report;
 }finally{provider.destroy();await evm.disconnect()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const report=await verifyLocal();console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1}catch(e){console.error(e.message);process.exitCode=1}}
