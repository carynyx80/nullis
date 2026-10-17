import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMainnet} from './probe-mainnet.mjs';
import {vectors} from './precompiles.mjs';

function mock({chain = '0x1237', changed = false, invalid = false} = {}) {
  const calls = []; let chainReads = 0;
  const request = async (method, params = []) => {
    calls.push({method, params});
    if (method === 'eth_chainId') return changed && chainReads++ ? '0x1' : chain;
    if (method === 'eth_blockNumber') return '0x100';
    if (method === 'eth_call') return invalid ? '0x' : vectors.find(v => v.data === params[0].data && v.to === params[0].to).expected;
    throw Error('Unexpected RPC method');
  };
  return {request, calls};
}
test('mainnet arithmetic calls are pinned to the same block and read-only', async () => {
  const {request, calls} = mock(); const result = await checkMainnet(request);
  assert.equal(result.passed, true); assert.equal(result.chainId, 4663);
  assert.equal(calls.filter(c => c.method === 'eth_call').length, 4);
  for (const call of calls.filter(c => c.method === 'eth_call')) assert.equal(call.params[1], '0x100');
  assert.ok(calls.every(c => ['eth_call', 'eth_chainId', 'eth_blockNumber'].includes(c.method)));
});
test('wrong network stops before arithmetic calls', async () => {
  const {request, calls} = mock({chain: '0x1'});
  await assert.rejects(checkMainnet(request), /Wrong chain/); assert.equal(calls.length, 1);
});
test('network changes invalidate the result', async () => {
  await assert.rejects(checkMainnet(mock({changed: true}).request), /network changed/);
});
test('incorrect arithmetic results fail compatibility', async () => {
  assert.equal((await checkMainnet(mock({invalid: true}).request)).passed, false);
});
