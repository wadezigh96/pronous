import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteParams, USDT, WBNB } from '../lib/execution.js';

const NVDA = '0x1111111111111111111111111111111111111111';

test('small decimal amount converts to a valid uint256 raw amount', () => {
  const result = buildQuoteParams({
    fromTokenAddress: USDT,
    toTokenAddress: NVDA,
    amount: '0.001'
  });
  assert.equal(result.ok, true);
  assert.equal(result.params.amount, '1000000000000000');
});

test('WBNB remains the supported spend-token address', () => {
  const result = buildQuoteParams({
    fromTokenAddress: WBNB,
    toTokenAddress: NVDA,
    amount: '0.001'
  });
  assert.equal(result.ok, true);
  assert.equal(result.params.fromTokenAddress, WBNB);
});

test('amounts above uint256 are rejected before upstream quote', () => {
  const tooLarge = '1' + '0'.repeat(78);
  const result = buildQuoteParams({
    fromTokenAddress: USDT,
    toTokenAddress: NVDA,
    amount: tooLarge
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Invalid amount for the selected spend token.');
});
