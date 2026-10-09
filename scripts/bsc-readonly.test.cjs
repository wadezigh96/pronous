const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRpcUrl, verifyBscMainnetContracts } = require('../lib/bsc-readonly.js');

const address = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432';
function mockFetch(results) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request);
    const result = results.shift();
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => result
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('RPC URL is restricted to the pinned HTTPS BSC endpoint', () => {
  assert.equal(validateRpcUrl(), 'https://bsc-dataseed.binance.org');
  assert.throws(() => validateRpcUrl('http://bsc-dataseed.binance.org'), /BSC_RPC_HOST_NOT_ALLOWED/);
  assert.throws(() => validateRpcUrl('https://evil.example'), /BSC_RPC_HOST_NOT_ALLOWED/);
  assert.throws(() => validateRpcUrl('https://user:pass@bsc-dataseed.binance.org'), /BSC_RPC_HOST_NOT_ALLOWED/);
});

test('verifier checks chain 56 and reads bytecode without transaction methods', async () => {
  const fetchImpl = mockFetch([
    { result: '0x38' },
    { result: '0x60016000' }
  ]);
  const result = await verifyBscMainnetContracts([{ label: 'ERC-8004 identity', address }], { fetchImpl });
  assert.equal(result.chainId, 56);
  assert.equal(result.mode, 'read-only');
  assert.equal(result.transactionBroadcast, false);
  assert.equal(result.contracts[0].hasCode, true);
  assert.equal(result.contracts[0].bytecodeBytes, 4);
  assert.deepEqual(fetchImpl.calls.map(x => x.method), ['eth_chainId', 'eth_getCode']);
});

test('verifier fails closed on a non-mainnet chain', async () => {
  const fetchImpl = mockFetch([{ result: '0x61' }]);
  await assert.rejects(() => verifyBscMainnetContracts([address], { fetchImpl }), /WRONG_CHAIN_ID/);
  assert.deepEqual(fetchImpl.calls.map(x => x.method), ['eth_chainId']);
});

test('verifier rejects invalid addresses before making RPC calls', async () => {
  const fetchImpl = mockFetch([]);
  await assert.rejects(() => verifyBscMainnetContracts(['not-an-address'], { fetchImpl }), /INVALID_CONTRACT_ADDRESS/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('verifier marks empty code as not a deployed contract', async () => {
  const fetchImpl = mockFetch([{ result: '0x38' }, { result: '0x' }]);
  const result = await verifyBscMainnetContracts([address], { fetchImpl });
  assert.equal(result.contracts[0].hasCode, false);
  assert.equal(result.contracts[0].bytecodeBytes, 0);
});
