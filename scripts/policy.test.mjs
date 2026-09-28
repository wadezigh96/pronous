import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpendCap } from '../lib/policy.js';

test('quote build spend cap rejects zero and negative amounts', () => {
  assert.equal(validateSpendCap(0, 10).ok, false);
  assert.equal(validateSpendCap(-1, 10).ok, false);
  assert.equal(validateSpendCap('0.5', 10).ok, true);
});

test('quote build spend cap rejects amount above maxSpend', () => {
  assert.equal(validateSpendCap(10.01, 10).ok, false);
  assert.equal(validateSpendCap(10, 10).ok, true);
});

test('quote build spend cap rejects non-numeric values', () => {
  assert.equal(validateSpendCap('abc', 10).ok, false);
  assert.equal(validateSpendCap(1, 'abc').ok, false);
});
