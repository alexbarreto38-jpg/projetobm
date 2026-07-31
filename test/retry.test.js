import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRetry } from '../src/retry.js';

const FINAL = [
  { bm: 'BM A', to: '5511000000001', messageId: 'wamid.AAA', finalStatus: 'read' },
  { bm: 'BM A', to: '5511000000002', messageId: 'wamid.BBB', finalStatus: 'failed', errorCode: '131049' },
  { bm: 'BM B', to: '5511000000003', messageId: '', finalStatus: 'send_failed' },
  { bm: 'BM B', to: '5511000000004', messageId: 'wamid.DDD', finalStatus: 'no_status' },
  { bm: 'BM B', to: '5511000000005', messageId: 'wamid.EEE', finalStatus: 'delivered' },
];

test('planRetry seleciona failed e send_failed por padrão', () => {
  const { byBM, count, byStatus } = planRetry(FINAL);
  assert.equal(count, 2);
  assert.equal(byStatus.failed, 1);
  assert.equal(byStatus.send_failed, 1);
  assert.deepEqual(
    byBM.get('BM A').map((r) => r.phone),
    ['5511000000002']
  );
  assert.deepEqual(
    byBM.get('BM B').map((r) => r.phone),
    ['5511000000003']
  );
});

test('planRetry inclui no_status quando pedido', () => {
  const { count, byStatus } = planRetry(FINAL, { statuses: ['failed', 'send_failed', 'no_status'] });
  assert.equal(count, 3);
  assert.equal(byStatus.no_status, 1);
});

test('planRetry recupera variáveis do template por telefone', () => {
  const recipientsByPhone = new Map([
    ['5511000000002', { phone: '5511000000002', vars: { body1: 'Maria' } }],
  ]);
  const { byBM } = planRetry(FINAL, { recipientsByPhone });
  const rcpt = byBM.get('BM A')[0];
  assert.deepEqual(rcpt.vars, { body1: 'Maria' });
});

test('planRetry sem seleção retorna vazio', () => {
  const { count, byBM } = planRetry(
    [{ bm: 'X', to: '551199', finalStatus: 'read' }],
    { statuses: ['failed'] }
  );
  assert.equal(count, 0);
  assert.equal(byBM.size, 0);
});
