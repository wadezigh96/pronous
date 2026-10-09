import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USDT, USDC, ROUTING_API, parseHumanAmount, formatRawAmount,
  validatePancakePair, getPancakeQuote
} from '../lib/pancakeswap-quote.js';

const STOCK = '0x1111111111111111111111111111111111111111';
const RPC_URL = 'https://bsc-dataseed.binance.org';

test('amount conversion respects on-chain decimals without floating point', () => {
  assert.equal(parseHumanAmount('1.23', 18), '1230000000000000000');
  assert.equal(parseHumanAmount('1.234', 2), null);
  assert.equal(parseHumanAmount('0', 18), null);
  assert.equal(parseHumanAmount('1e4', 18), null);
  assert.equal(formatRawAmount('1230000000000000000', 18), '1.23');
  assert.equal(formatRawAmount('4500', 2), '45');
});

test('only BSC stablecoin to selected RWA pairs are permitted', () => {
  assert.equal(validatePancakePair({ tokenInAddress: USDT, tokenOutAddress: STOCK, assetAddress: STOCK }).ok, true);
  assert.equal(validatePancakePair({ tokenInAddress: STOCK, tokenOutAddress: USDC, assetAddress: STOCK }).ok, true);
  assert.equal(validatePancakePair({ tokenInAddress: USDT, tokenOutAddress: USDC, assetAddress: STOCK }).error, 'UNSUPPORTED_PANCAKESWAP_PAIR');
  assert.equal(validatePancakePair({ tokenInAddress: STOCK, tokenOutAddress: STOCK, assetAddress: STOCK }).error, 'TOKENS_MUST_DIFFER');
});

test('quote uses fixed BSC chain IDs, source token decimals, and never enables broadcast', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    seen.push({ url: target, init });
    if (target === RPC_URL) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.method, 'eth_call');
      assert.equal(payload.params[0].data, '0x313ce567');
      return { ok: true, json: async () => ({ result: '0x12' }) };
    }
    if (target.startsWith(ROUTING_API)) {
      const u = new URL(target);
      assert.equal(u.searchParams.get('tokenInChainId'), '56');
      assert.equal(u.searchParams.get('tokenOutChainId'), '56');
      assert.equal(u.searchParams.get('amount'), '1230000000000000000');
      assert.equal(u.searchParams.get('type'), 'exactIn');
      return {
        ok: true,
        json: async () => ({ trade: {
          inputAmount: '1230000000000000000',
          outputAmount: '4560000000000000000',
          priceImpact: '0.12',
          blockNumber: 123,
          routes: [{ type: 'V3' }, { type: 'STABLE' }]
        } })
      };
    }
    throw new Error('Unexpected URL in test');
  };

  const quote = await getPancakeQuote({
    assetAddress: STOCK,
    tokenInAddress: USDT,
    tokenOutAddress: STOCK,
    amount: '1.23'
  }, { fetchImpl, rpcUrl: RPC_URL, now: () => 1000 });

  assert.equal(quote.status, 'QUOTE_ONLY');
  assert.equal(quote.venue, 'PancakeSwap');
  assert.equal(quote.amountIn, '1.23');
  assert.equal(quote.amountOut, '4.56');
  assert.deepEqual(quote.routeTypes, ['V3', 'STABLE']);
  assert.equal(quote.quotedAt, 1000);
  assert.equal(quote.validForMs, 15000);
  assert.equal(quote.calldataAvailable, false);
  assert.equal(quote.broadcast, false);
  assert.equal(seen.filter((x) => x.url === RPC_URL).length, 2);
});

test('unsupported token pair is rejected before making network requests', async () => {
  let called = false;
  await assert.rejects(() => getPancakeQuote({
    assetAddress: STOCK,
    tokenInAddress: USDT,
    tokenOutAddress: USDC,
    amount: '1'
  }, { fetchImpl: async () => { called = true; throw new Error('network should not run'); }, rpcUrl: RPC_URL }),
  (error) => error.code === 'UNSUPPORTED_PANCAKESWAP_PAIR');
  assert.equal(called, false);
});
