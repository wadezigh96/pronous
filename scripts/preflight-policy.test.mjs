import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuardChecks, preflightStatus } from '../lib/policy.js';

const demoAsset = {
  demo: true,
  ticker: 'NVDA',
  platformId: 'demo',
  tokenPrice: '182.6496',
  referencePrice: '181.20'
};

test('demo RWA asset can reach simulation gate without a fake contract', () => {
  const checks = buildGuardChecks(demoAsset, { amount: '0.0003', maxSpend: '1' });
  assert.equal(preflightStatus(checks), 'READY_FOR_SIMULATION');
  assert.equal(checks.find(x => x.id === 'asset').pass, true);
  assert.equal(checks.find(x => x.id === 'spend_cap').pass, true);
  assert.equal(checks.find(x => x.id === 'simulation').pass, false);
});

test('live asset still requires supported platform and real contract', () => {
  const asset = {
    ticker: 'NVDA',
    platformId: 'demo',
    tokenPrice: '182.6496',
    referencePrice: '181.20'
  };
  const checks = buildGuardChecks(asset, { amount: '0.0003', maxSpend: '1' });
  assert.equal(preflightStatus(checks), 'BLOCKED');
  assert.equal(checks.find(x => x.id === 'asset').pass, false);
});

test('invalid spend cap remains blocked', () => {
  const checks = buildGuardChecks(demoAsset, { amount: '2', maxSpend: '1' });
  assert.equal(preflightStatus(checks), 'BLOCKED');
  assert.equal(checks.find(x => x.id === 'spend_cap').pass, false);
});
