import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifySignature, parseWebhookPayload, startWebhookServer } from '../src/webhook.js';

function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

const SAMPLE = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          value: {
            metadata: { phone_number_id: 'PHONE_123' },
            statuses: [
              { id: 'wamid.AAA', status: 'delivered', timestamp: '1700000000', recipient_id: '5511999990001' },
              {
                id: 'wamid.BBB',
                status: 'failed',
                timestamp: '1700000001',
                recipient_id: '5511999990002',
                errors: [{ code: 131049, title: 'limite de marketing' }],
              },
            ],
          },
        },
      ],
    },
  ],
};

test('verifySignature aceita assinatura correta e rejeita errada', () => {
  const raw = JSON.stringify({ a: 1 });
  const secret = 'segredo';
  assert.equal(verifySignature(raw, sign(raw, secret), secret), true);
  assert.equal(verifySignature(raw, 'sha256=deadbeef', secret), false);
  assert.equal(verifySignature(raw, undefined, secret), false);
  // sem segredo configurado, não valida (modo dev)
  assert.equal(verifySignature(raw, undefined, undefined), true);
});

test('parseWebhookPayload extrai statuses com erro', () => {
  const { statuses, messages } = parseWebhookPayload(SAMPLE);
  assert.equal(statuses.length, 2);
  assert.equal(messages.length, 0);
  assert.equal(statuses[0].status, 'delivered');
  assert.equal(statuses[0].phoneId, 'PHONE_123');
  assert.equal(statuses[1].status, 'failed');
  assert.equal(statuses[1].errorCode, 131049);
});

test('integração webhook: handshake GET devolve o challenge', async () => {
  const srv = await startWebhookServer({ port: 0, verifyToken: 'tok123' });
  try {
    const ok = await fetch(`${srv.url}?hub.mode=subscribe&hub.verify_token=tok123&hub.challenge=42`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '42');

    const bad = await fetch(`${srv.url}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
    assert.equal(bad.status, 403);
  } finally {
    await srv.close();
  }
});

test('integração webhook: POST assinado grava statuses no CSV', async () => {
  const out = path.join(os.tmpdir(), `wh-${Date.now()}.csv`);
  const secret = 'app_secret_xyz';
  const srv = await startWebhookServer({ port: 0, verifyToken: 't', appSecret: secret, out });
  try {
    const raw = JSON.stringify(SAMPLE);
    const res = await fetch(srv.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw, secret) },
      body: raw,
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'EVENT_RECEIVED');
    assert.equal(srv.stats.statuses, 2);

    const csv = fs.readFileSync(out, 'utf8');
    assert.match(csv, /wamid.AAA,5511999990001,delivered/);
    assert.match(csv, /wamid.BBB,5511999990002,failed/);
    assert.match(csv, /131049/);
  } finally {
    await srv.close();
    fs.rmSync(out, { force: true });
  }
});

test('integração webhook: POST com assinatura inválida é rejeitado (401)', async () => {
  const srv = await startWebhookServer({ port: 0, verifyToken: 't', appSecret: 'segredo' });
  try {
    const res = await fetch(srv.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' },
      body: JSON.stringify(SAMPLE),
    });
    assert.equal(res.status, 401);
    assert.equal(srv.stats.rejected, 1);
    assert.equal(srv.stats.statuses, 0);
  } finally {
    await srv.close();
  }
});
