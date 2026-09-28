import test from 'node:test';
import assert from 'node:assert/strict';
import state from '../lib/wallet-state.js';

const INJECTED = { source: 'injected', address: '0x1111111111111111111111111111111111111111', chainId: 56 };
const INJECTED_2 = { source: 'injected', address: '0x2222222222222222222222222222222222222222', chainId: 56 };
const PRIVY = { source: 'privy', address: '0x3333333333333333333333333333333333333333', chainId: 56 };

test('same active wallet is deduped', () => {
  const first = state.activate(null, INJECTED);
  const second = state.activate(first.state, { ...INJECTED, address: INJECTED.address.toUpperCase(), chainId: '0x38' });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.reason, 'UNCHANGED');
});

test('changing injected account resets the active wallet', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.providerEvent(current, 'injected', 'accountsChanged', [INJECTED_2.address]);
  assert.equal(next.changed, true);
  assert.equal(next.state.address, INJECTED_2.address);
});

test('changing chain resets execution authorization at the consumer boundary', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.providerEvent(current, 'injected', 'chainChanged', '0x1');
  assert.equal(next.changed, true);
  assert.equal(next.state.chainId, 1);
});

test('empty account list clears the active wallet', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.providerEvent(current, 'injected', 'accountsChanged', []);
  assert.equal(next.changed, true);
  assert.equal(next.state, null);
});

test('reconnecting a different wallet changes the source identity', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.activate(current, INJECTED_2);
  assert.equal(next.changed, true);
  assert.equal(next.reason, 'WALLET_CHANGED');
  assert.equal(next.state.source, 'injected');
  assert.equal(next.state.address, INJECTED_2.address);
});

test('privy cannot overwrite an active injected wallet without an explicit source change', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.activate(current, PRIVY);
  assert.equal(next.changed, true);
  assert.equal(next.reason, 'SOURCE_CHANGED');
  assert.equal(next.state.source, 'privy');
});

test('injected events cannot mutate an active privy wallet', () => {
  const current = state.activate(null, PRIVY).state;
  const next = state.providerEvent(current, 'injected', 'accountsChanged', [INJECTED.address]);
  assert.equal(next.changed, false);
  assert.equal(next.state.source, 'privy');
  assert.equal(next.state.address, PRIVY.address);
});

test('privy events cannot mutate an active injected wallet', () => {
  const current = state.activate(null, INJECTED).state;
  const next = state.providerEvent(current, 'privy', 'chainChanged', '0x1');
  assert.equal(next.changed, false);
  assert.equal(next.state.source, 'injected');
  assert.equal(next.state.chainId, 56);
});

test('disconnect only clears the active source', () => {
  const current = state.activate(null, INJECTED).state;
  const ignored = state.clear(current, 'privy');
  assert.equal(ignored.changed, false);
  assert.equal(ignored.state.source, 'injected');
  const cleared = state.clear(current, 'injected');
  assert.equal(cleared.changed, true);
  assert.equal(cleared.state, null);
});
