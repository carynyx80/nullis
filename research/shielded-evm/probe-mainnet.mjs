import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {probePrecompiles} from './precompiles.mjs';

export async function checkMainnet(request) {
  const chainId = Number(BigInt(await request('eth_chainId')));
  if (chainId !== 4663) throw Error('Wrong chain: expected Robinhood mainnet 4663');
  const block = await request('eth_blockNumber');
  if (!/^0x[0-9a-f]+$/i.test(block)) throw Error('Invalid block number');
  const checks = await probePrecompiles(request, block);
  if (Number(BigInt(await request('eth_chainId'))) !== 4663) throw Error('RPC network changed during probe');
  return {chainId, block, checks, passed: checks.every(check => check.passed)};
}

async function main() {
  const url = process.env.NULLIS_MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com';
  let id = 0;
  const report = {milestone: 'Robinhood mainnet arithmetic compatibility', checkedAt: new Date().toISOString(),
    transactionsSent: 0, contractsDeployed: false, financialActionsEnabled: false,
    provider: process.env.NULLIS_MAINNET_RPC ? 'custom (URL omitted)' : 'documented public RPC'};
  try {
    const request = async (method, params = []) => {
      if (!['eth_chainId', 'eth_blockNumber', 'eth_call'].includes(method)) throw Error('Read-only RPC method required');
      const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, params}), signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('RPC HTTP ' + response.status);
      const body = await response.json();
      if (body.error || !('result' in body)) throw Error('Invalid RPC response');
      return body.result;
    };
    Object.assign(report, await checkMainnet(request), {status: 'completed'});
  } catch (error) {
    // Provider URLs and error bodies may contain credentials: never log them.
    Object.assign(report, {status: 'unverified', passed: false, reason:
      /^(Wrong chain|RPC network changed|Invalid block number|RPC HTTP|Invalid RPC response)/.test(error.message)
        ? error.message : 'RPC connection failed or timed out'});
  }
  writeFileSync(new URL('./mainnet-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
