// Verifies a user-signed deployment; never submits or signs a live transaction.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {accountRoot} from './build.mjs';
import {rpc} from './probe.mjs';
import {NETWORK as n} from './network.mjs';
const {Interface,AbiCoder,getAddress,keccak256}=createRequire(new URL('./package.json',import.meta.url))('ethers');
const address=getAddress(process.argv[2]||''),hash=process.argv[3];
assert.match(hash||'',/^0x[0-9a-f]{64}$/i,'Pass the deployment transaction hash');
assert.equal(BigInt(await rpc('eth_chainId')),4663n);
const artifact=JSON.parse(readFileSync(resolve(accountRoot,'artifacts/account.json'))),iface=new Interface(artifact.abi);
const receipt=await rpc('eth_getTransactionReceipt',[hash]),tx=await rpc('eth_getTransactionByHash',[hash]);
assert.ok(receipt&&tx,'Deployment has not been mined');assert.equal(BigInt(receipt.status),1n);assert.equal(receipt.to,null);assert.equal(tx.to,null);
assert.equal(getAddress(receipt.contractAddress),address);assert.equal(getAddress(receipt.from),getAddress(tx.from));
const args=AbiCoder.defaultAbiCoder().encode(['address','address','address','address'],[n.weth,n.usd,n.router,n.factory]);
assert.equal(tx.input.toLowerCase(),'0x'+artifact.evm.bytecode.object.toLowerCase()+args.slice(2).toLowerCase(),'Creation transaction does not match reviewed code and arguments');
const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);assert.equal(block.hash,receipt.blockHash,'Receipt block changed');
let code=(await rpc('eth_getCode',[address,'latest'])).slice(2);
for(const {start,length} of Object.values(artifact.evm.deployedBytecode.immutableReferences).flat())code=code.slice(0,start*2)+'0'.repeat(length*2)+code.slice((start+length)*2);
assert.equal(keccak256('0x'+code),keccak256('0x'+artifact.evm.deployedBytecode.object));
for(const [fn,key] of [['wrappedEther','weth'],['dollar','usd'],['router','router']]){
 const result=iface.decodeFunctionResult(fn,await rpc('eth_call',[{to:address,data:iface.encodeFunctionData(fn)},'latest']))[0];assert.equal(result.toLowerCase(),n[key]);
}
const result={checkedAt:new Date().toISOString(),chainId:4663,address,transactionHash:hash,deployer:getAddress(receipt.from),blockNumber:Number(BigInt(receipt.blockNumber)),blockHash:receipt.blockHash,
 sourceSha256:artifact.sourceSha256,compiler:artifact.compiler,runtimeHash:keccak256('0x'+code),verified:true,private:false,independentlyAudited:false};
writeFileSync(resolve(accountRoot,'deployment.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
