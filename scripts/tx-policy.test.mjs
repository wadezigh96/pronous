import test from 'node:test';
import assert from 'node:assert/strict';
import { BINANCE_DEX_ROUTER, validateBroadcastTx } from '../lib/tx-policy.js';

const good = { to: BINANCE_DEX_ROUTER, data: '0x810c705b00', value: '0x0' };

test('broadcast policy accepts BSC Binance DEX router swap', () => {
  assert.equal(validateBroadcastTx(good, 56).ok, true);
});

test('broadcast policy rejects wrong chain, target, selector and native value', () => {
  assert.equal(validateBroadcastTx(good, 1).ok, false);
  assert.equal(validateBroadcastTx({ ...good, to: '0x0000000000000000000000000000000000000001' }, 56).error, 'TX_TARGET_NOT_ALLOWLISTED');
  assert.equal(validateBroadcastTx({ ...good, data: '0x095ea7b3' }, 56).error, 'TX_SELECTOR_NOT_ALLOWLISTED');
  assert.equal(validateBroadcastTx({ ...good, value: '0x1' }, 56).error, 'NONZERO_NATIVE_VALUE_BLOCKED');
});
