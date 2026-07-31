import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../src/reconcile.js';

test('reconcile junta envios com status e escolhe o mais avançado', () => {
  const sends = [
    { bm: 'BM A', to: '5511000000001', messageId: 'wamid.AAA', sendStatus: 'sent', error: '' },
    { bm: 'BM A', to: '5511000000002', messageId: 'wamid.BBB', sendStatus: 'sent', error: '' },
    { bm: 'BM B', to: '5511000000003', messageId: 'wamid.CCC', sendStatus: 'sent', error: '' },
    { bm: 'BM B', to: '5511000000004', messageId: '', sendStatus: 'failed', error: 'token inválido (code=190)' },
    { bm: 'BM B', to: '5511000000005', messageId: '', sendStatus: 'skipped', error: '' },
  ];
  const status = [
    // AAA: sent -> delivered -> read  => read prevalece
    { phoneId: 'P1', messageId: 'wamid.AAA', recipient: '5511000000001', status: 'sent', errorCode: '', errorTitle: '' },
    { phoneId: 'P1', messageId: 'wamid.AAA', recipient: '5511000000001', status: 'delivered', errorCode: '', errorTitle: '' },
    { phoneId: 'P1', messageId: 'wamid.AAA', recipient: '5511000000001', status: 'read', errorCode: '', errorTitle: '' },
    // BBB: delivered depois failed => failed é terminal
    { phoneId: 'P1', messageId: 'wamid.BBB', recipient: '5511000000002', status: 'delivered', errorCode: '', errorTitle: '' },
    { phoneId: 'P1', messageId: 'wamid.BBB', recipient: '5511000000002', status: 'failed', errorCode: '131049', errorTitle: 'limite marketing' },
    // CCC: sem status no webhook
  ];

  const { rows, summary } = reconcile(sends, status);

  const byMsg = Object.fromEntries(rows.map((r) => [r.messageId || r.to, r]));
  assert.equal(byMsg['wamid.AAA'].finalStatus, 'read');
  assert.equal(byMsg['wamid.BBB'].finalStatus, 'failed');
  assert.equal(byMsg['wamid.BBB'].errorCode, '131049');
  assert.equal(byMsg['wamid.CCC'].finalStatus, 'no_status');
  assert.equal(byMsg['5511000000004'].finalStatus, 'send_failed');
  assert.equal(byMsg['5511000000005'].finalStatus, 'skipped');

  assert.equal(summary.read, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.no_status, 1);
  assert.equal(summary.send_failed, 1);
  assert.equal(summary.skipped, 1);
});

test('reconcile lida com status sem messageId (ignora)', () => {
  const sends = [{ bm: 'X', to: '551199', messageId: 'wamid.Z', sendStatus: 'sent', error: '' }];
  const status = [{ messageId: '', status: 'delivered' }];
  const { rows } = reconcile(sends, status);
  assert.equal(rows[0].finalStatus, 'no_status');
});
