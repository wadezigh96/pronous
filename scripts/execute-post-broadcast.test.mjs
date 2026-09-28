import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastPoaFailureMessage } from '../lib/execution-result.js';
import fs from 'node:fs';

test('post-send POA failure tells user not to resend', () => {
  const msg = broadcastPoaFailureMessage('0xabc');
  assert.match(msg, /Transaksi terkirim/);
  assert.match(msg, /0xabc/);
  assert.match(msg, /JANGAN kirim ulang/);
});

test('desk clears execution flags before POA recording', () => {
  const source = fs.readFileSync('desk-onchain.js', 'utf8');
  const reset = source.indexOf('window.__pronousSimulated = false;', source.indexOf('const txHash = await sendTx'));
  const poa = source.indexOf('await createExecutedPoa(txHash', reset);
  assert.ok(reset >= 0 && poa > reset);
});
