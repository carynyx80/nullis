import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {NETWORK as n} from './network.mjs';
import {accountRoot} from './build.mjs';
const {Interface,keccak256}=createRequire(new URL('./package.json',import.meta.url))('ethers');
export const ABI={router:['function WETH9() view returns(address)','function factory() view returns(address)'],
 factory:['function getPool(address,address,uint24) view returns(address)'],
 quoter:['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']};
let id=0;
export async function rpc(method,params=[]) {
 if(!['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_gasPrice','eth_getBalance','eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method))throw Error('Read-only RPC required');
 let r;try{r=await fetch(n.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(20000)});}catch{throw Error('Mainnet RPC unavailable');}
 if(!r.ok)throw Error('Mainnet HTTP failure');const b=await r.json();if(b.error||b.result===undefined)throw Error('Mainnet method failed: '+method);return b.result;
}
export async function probe() {
 if(BigInt(await rpc('eth_chainId'))!==4663n)throw Error('Wrong network');
 const block=await rpc('eth_blockNumber'),header=await rpc('eth_getBlockByNumber',[block,false]);
 if(Math.abs(Date.now()/1000-Number(BigInt(header.timestamp)))>600)throw Error('Stale mainnet RPC');
 const hashes={};
 for(const name of ['weth','usd','router','factory','quoter','deployer']) {
  const code=await rpc('eth_getCode',[n[name],block]);if(code==='0x')throw Error('Missing contract: '+name);hashes[name]=keccak256(code);
 }
 if(hashes.deployer!==n.deployerHash)throw Error('Deployment factory runtime differs from the reference');
 const iface=new Interface(ABI.router);
 for(const [fn,key] of [['WETH9','weth'],['factory','factory']]) {
  const result=iface.decodeFunctionResult(fn,await rpc('eth_call',[{to:n.router,data:iface.encodeFunctionData(fn)},block]))[0];
  if(result.toLowerCase()!==n[key])throw Error('Router wiring mismatch');
 }
 const factory=new Interface(ABI.factory),quoter=new Interface(ABI.quoter),routes=[];
 for(const fee of n.fees) {
  const pool=factory.decodeFunctionResult('getPool',await rpc('eth_call',[{to:n.factory,data:factory.encodeFunctionData('getPool',[n.weth,n.usd,fee])},block]))[0];
  if(BigInt(pool)===0n)continue;
  try{
   const result=quoter.decodeFunctionResult('quoteExactInputSingle',await rpc('eth_call',[{to:n.quoter,data:quoter.encodeFunctionData('quoteExactInputSingle',[[n.weth,n.usd,10n**15n,fee,0]])},block]));
   if(result[0]>0n)routes.push({fee,pool,amountIn:'1000000000000000',amountOut:result[0].toString()});
  }catch{}
 }
 const report={checkedAt:new Date().toISOString(),chainId:4663,block:{number:Number(BigInt(block)),hash:header.hash,timestamp:Number(BigInt(header.timestamp))},hashes,routes,transactionsSent:0,passed:routes.length>0};
 mkdirSync(resolve(accountRoot,'artifacts'),{recursive:true});writeFileSync(resolve(accountRoot,'artifacts/network.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.passed)throw Error('No supported WETH/USDG v3 liquidity route found');
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(accountRoot,'probe.mjs'))console.log(JSON.stringify(await probe(),null,2));
