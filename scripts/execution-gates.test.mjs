import test from 'node:test';
import assert from 'node:assert/strict';
import gates from '../lib/execution-gates.js';
import execution from '../lib/execution.js';

test('canExecute requires wallet, simulation, confirmation and matching hash', () => {
  const base = { wallet: '0xabc', simulated: true, confirmed: true, paramsHash: 'a', simHash: 'a' };
  assert.equal(gates.canExecute(base), true);
  assert.equal(gates.canExecute({ ...base, wallet: null }), false);
  assert.equal(gates.canExecute({ ...base, simulated: false }), false);
  assert.equal(gates.canExecute({ ...base, confirmed: false }), false);
  assert.equal(gates.canExecute({ ...base, simHash: 'b' }), false);
});

test('confirmation must be explicit true', () => {
  assert.equal(gates.confirmationAccepted(true), true);
  assert.equal(gates.confirmationAccepted(false), false);
  assert.equal(gates.confirmationAccepted(undefined), false);
  assert.equal(gates.confirmationAccepted('true'), false);
});

test('in-flight guard rejects a second execution', () => {
  const state = {};
  assert.equal(gates.beginExecution(state), true);
  assert.equal(gates.beginExecution(state), false);
  gates.endExecution(state);
  assert.equal(gates.beginExecution(state), true);
});

test('reset clears execution authorization and transaction binding', () => {
  const state = { simulated: true, confirmed: true, builtTx: { to: '0x1' }, paramsHash: 'a', simHash: 'a', inFlight: true };
  gates.resetExecutionState(state);
  assert.deepEqual(state, { simulated: false, confirmed: false, builtTx: null, paramsHash: null, simHash: null, inFlight: true });
});

test('reset model covers changed input state', () => {
  const state = { simulated: true, confirmed: true, builtTx: { value: '1' }, paramsHash: 'old', simHash: 'old', inFlight: false };
  gates.resetExecutionState(state);
  assert.equal(gates.canExecute({ wallet: '0xabc', ...state }), false);
});

test('canonical JSON is stable for object key order', () => {
  assert.equal(gates.canonicalJson({ b: 2, a: 1 }), gates.canonicalJson({ a: 1, b: 2 }));
});

test('native BNB route is guarded', () => {
  assert.equal(gates.nativeBnbRouteBlocked('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'), true);
  assert.equal(gates.nativeBnbRouteBlocked(execution.USDT), false);
});

test('decimal amount conversion stays exact within token decimals', () => {
  assert.equal(execution.decimalToRawAmount('5.1', 18), '5100000000000000000');
  assert.equal(execution.decimalToRawAmount('0.0005', 18), '500000000000000');
  assert.equal(execution.decimalToRawAmount('1.234', 2), null);
});

test('safe BNB spendable balance keeps the gas reserve', () => {
  assert.equal(gates.safeSpendableBnb(0.0005), 0.0003);
  assert.equal(gates.safeSpendableBnb(0.0001), 0);
  assert.equal(gates.safeSpendableBnb(1, 0.25), 0.75);
});