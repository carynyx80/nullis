// All signed transactions remain inside an in-memory fork. No live-chain sender exists.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,AbiCoder,ZeroAddress,keccak256} from 'ethers';
import {poseidonContract} from 'circomlibjs';
import {compileCached,root} from './compile.mjs';
import {testWithdrawals} from './withdrawal-test.mjs';

const artifacts=resolve(root,'artifacts'),prover=resolve(root,'../research/zeto-prover/artifacts');
const read=name=>JSON.parse(readFileSync(resolve(artifacts,name)));
// Invalidate a previous result before initialization or provider startup can fail.
writeFileSync(resolve(artifacts,'mainnet-fork.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed:false,
  status:'starting',mainnetTransactionsSent:0,mainnetContractsDeployed:false,productionReady:false},null,2)+'\n');
const preflight=read('mainnet-preflight.json');
assert.ok(preflight.passed && !preflight.contractsDeployed && preflight.chainId===4663);
assert.ok(Date.now()-Date.parse(preflight.checkedAt)<3600000,'Refresh the mainnet preflight first');
assert.equal(preflight.asset.address.toLowerCase(),'0x0bd7d308f8e1639fab988df18a8011f41eacad73','This fork test only supports candidate WETH');
const output=compileCached({
  'test/Fixtures.sol':{content:readFileSync(resolve(root,'test/Fixtures.sol'),'utf8')},
  'test/LocalVerifier.sol':{content:readFileSync(resolve(prover,'LocalVerifier.sol'),'utf8')},
  'test/WithdrawalVerifier.sol':{content:readFileSync(resolve(prover,'WithdrawalVerifier.sol'),'utf8')}
});
// A fork needs historical storage reads; a load-balanced app RPC may not provide them.
const forkUrl=process.env.NULLIS_FORK_RPC||'https://rpc.mainnet.chain.robinhood.com';
const local=ganache.provider({fork:{url:forkUrl,blockNumber:Number(preflight.block.number)},
  chain:{chainId:4663,hardfork:'shanghai',allowUnlimitedContractSize:false},
  miner:{blockGasLimit:60000000},wallet:{totalAccounts:3},logging:{quiet:true}});
const provider=new BrowserProvider(local); provider.pollingInterval=10;
const libraries=new Map(),deploymentGas=[],checks=[];
const coder=AbiCoder.defaultAbiCoder();
const report={checkedAt:new Date().toISOString(),mode:'in-memory Robinhood mainnet fork',chainId:4663,forkBlock:preflight.block,
  mainnetTransactionsSent:0,mainnetContractsDeployed:false,productionReady:false,testKeysOnly:true,asset:preflight.asset.address};
let stage='initialize fork';
try {
  const signer=await provider.getSigner(0),attacker=await provider.getSigner(1);
  async function deploy(file,name,args=[]) {
    stage='deploy '+name; console.log('Fork: '+stage);
    const artifact=output.contracts[file][name]; let code=artifact.evm.bytecode.object;
    for(const [libraryFile,entries] of Object.entries(artifact.evm.bytecode.linkReferences)) {
      for(const [libraryName,positions] of Object.entries(entries)) {
        const key=libraryFile+':'+libraryName;
        if(!libraries.has(key)) {
          let contract;
          if(/^PoseidonUnit[23]L$/.test(libraryName)) {
            const width=Number(libraryName.match(/[23]/)[0]);
            contract=await new ContractFactory(poseidonContract.generateABI(width),poseidonContract.createCode(width),signer).deploy();
            await contract.waitForDeployment();
            deploymentGas.push({name:libraryName,gasUsed:(await contract.deploymentTransaction().wait()).gasUsed.toString()});
          } else contract=await deploy(libraryFile,libraryName);
          libraries.set(key,await contract.getAddress());
        }
        for(const {start,length} of positions) {
          assert.equal(length,20);code=code.slice(0,start*2)+libraries.get(key).slice(2)+code.slice((start+length)*2);
        }
      }
    }
    assert.ok(!code.includes('__'));
    const contract=await new ContractFactory(artifact.abi,'0x'+code,signer).deploy(...args);
    await contract.waitForDeployment();
    deploymentGas.push({name,gasUsed:(await contract.deploymentTransaction().wait()).gasUsed.toString()});
    return contract;
  }
  async function reject(action,expected,iface) {
    let failure;try{await action();}catch(error){failure=error;}
    assert.ok(failure,'Expected rejection');let actual;
    try{actual=iface.parseError(failure.data||failure.info?.error?.data?.result)?.name;}catch{}
    assert.equal(actual,expected);
  }
  assert.equal((await provider.getNetwork()).chainId,4663n);
  stage='read pinned WETH runtime';
  const forkCode=await provider.getCode(preflight.asset.address);
  assert.equal(keccak256(forkCode),preflight.asset.runtimeKeccak256);
  const depositVerifier=await deploy('test/LocalVerifier.sol','Groth16Verifier');
  const depositAdapter=await deploy('test/Fixtures.sol','DepositVerifierAdapter',[depositVerifier.target]);
  const generated=await deploy('test/WithdrawalVerifier.sol','Groth16Verifier');
  const withdrawalAdapter=await deploy('src/WithdrawalVerifierAdapter.sol','WithdrawalVerifierAdapter',[generated.target]);
  const rejecting=await deploy('test/Fixtures.sol','RejectVerifier');
  const verifiers=[rejecting.target,depositAdapter.target,withdrawalAdapter.target,...Array(6).fill(rejecting.target)];
  const tuple='tuple(address verifier,address depositVerifier,address withdrawVerifier,address lockVerifier,address burnVerifier,address batchVerifier,address batchWithdrawVerifier,address batchLockVerifier,address batchBurnVerifier)';
  const config=keccak256(coder.encode([tuple],[verifiers]));
  const poolAbi=output.contracts['src/NullisPool.sol'].NullisPool.abi;
  async function makePool(asset) {
    const implementation=await deploy('src/NullisPool.sol','NullisPool',[asset.target,config]);
    const proxy=await deploy('src/NullisPoolProxy.sol','NullisPoolProxy',[implementation.target,'NULLIS fork test','nFORK',verifiers]);
    return new Contract(proxy.target,poolAbi,signer);
  }
  const asset=new Contract(preflight.asset.address,['function deposit() payable','function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)'],signer);
  stage='wrap fork-only ETH';
  assert.equal(await asset.balanceOf(await signer.getAddress()),0n);
  await(await asset.deposit({value:300n})).wait();
  assert.equal(await asset.balanceOf(await signer.getAddress()),300n);
  const pool=await makePool(asset);
  assert.equal(await pool.owner(),ZeroAddress);assert.equal(await pool.decimals(),18n);
  const fixture=await deploy('test/Fixtures.sol','TestAsset'),feePool=await makePool(fixture);
  const proof=JSON.parse(readFileSync(resolve(prover,'proof.json'))),signals=JSON.parse(readFileSync(resolve(prover,'public.json')));
  assert.equal(signals[0],'300');
  const args=[proof.pi_a.slice(0,2),[proof.pi_b[0].slice(0,2).reverse(),proof.pi_b[1].slice(0,2).reverse()],proof.pi_c.slice(0,2)];
  const encoded=coder.encode(['tuple(uint256[2] pA,uint256[2][2] pB,uint256[2] pC)'],[args]);
  for(const [token,target] of [[asset,pool],[fixture,feePool]]) {
    stage='approve '+(token===asset?'mainnet WETH':'control test asset');console.log('Fork: '+stage);
    await(await token.approve(target.target,300n)).wait();
    stage='deposit '+(token===asset?'mainnet WETH':'control test asset');console.log('Fork: '+stage);
    await(await target.deposit(300n,signals.slice(1),encoded,'0x',{gasLimit:10000000})).wait();
    assert.equal(await token.balanceOf(target.target),300n);
  }
  checks.push('Mainnet WETH bytecode matches the pinned block; local ETH wraps and deposits 300 wei through a real proof');
  const store=new Contract(await pool.noteStore(),output.contracts['zeto/lib/storage/nullifier.sol'].NullifierStorage.abi,attacker);
  stage='prove and settle fork-only withdrawals';
  const withdrawal=await testWithdrawals({root,prover,pool,feePool,asset,signer,attacker,provider,store,reject,generated,checks,tokenFaults:false,initialBalance:300n,artifactDirectory:resolve(artifacts,'fork')});
  assert.equal(await asset.balanceOf(pool.target),0n);
  Object.assign(report,{passed:true,checks,withdrawal,deploymentGas,
    note:'Gas is from local EVM execution, includes the second control pool, and is not a mainnet deployment quote. No production setup, user recovery or privacy is established.'});
}catch(error) {
  report.passed=false;report.failure='Fork validation failed; no mainnet transactions were submitted';
  report.failedStage=stage;
  const diagnostic=String(error?.info?.error?.message||error?.shortMessage||error?.message||'Unknown failure').replaceAll(forkUrl,'[RPC]').replace(/https?:\/\/[^\s"']+/g,'[URL]').slice(0,500);
  console.log('Sanitized fork diagnostic: '+diagnostic);
}finally {
  writeFileSync(resolve(artifacts,'mainnet-fork.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  await provider.destroy();await local.disconnect();
}
if(!report.passed)process.exitCode=1;
