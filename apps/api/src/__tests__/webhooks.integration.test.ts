import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { MetaMockServer } from '@wise/meta-provider';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { WebhookEnqueuer } from '../queue/enqueuer.js';
import { hasDb, makePrisma, makeTestMeta, resetDb, TEST_AUTH_SECRET } from './helpers.js';

// O MetaProvider do MetaContext usa este App Secret para verificar assinatura.
const APP_SECRET = 'TEST_APP_SECRET';
const VERIFY_TOKEN = 'verify-token-123';

class FakeEnqueuer implements WebhookEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string): Promise<void> {
    this.ids.push(id);
  }
}

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

describe.skipIf(!hasDb)('webhook ingest integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let enqueuer: FakeEnqueuer;

  beforeAll(async () => {
    const meta = makeTestMeta(new MetaMockServer());
    meta.webhookVerifyToken = VERIFY_TOKEN;
    enqueuer = new FakeEnqueuer();
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      meta,
      webhookEnqueuer: enqueuer,
    });
  });
  beforeEach(async () => {
    await resetDb(prisma);
    enqueuer.ids.length = 0;
    await prisma.webhookEvent.deleteMany({});
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { statuses: [] } }] }],
  });

  it('handshake GET retorna o challenge quando o token bate', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/webhooks/meta/whatsapp',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '42' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('42');
  });

  it('handshake GET rejeita token errado (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/webhooks/meta/whatsapp',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '42' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejeita assinatura inválida (401) e não persiste', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meta/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('aceita assinatura válida: persiste evento bruto e enfileira', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meta/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload) },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deduped).toBe(false);

    const events = await prisma.webhookEvent.findMany({});
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('messages');
    expect(events[0]!.status).toBe('RECEIVED');
    expect(enqueuer.ids).toHaveLength(1);
    expect(enqueuer.ids[0]).toBe(events[0]!.id);
  });

  it('deduplica redeliveries idênticas (não cria segundo evento)', async () => {
    const headers = { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload) };
    const first = await app.inject({ method: 'POST', url: '/api/webhooks/meta/whatsapp', headers, payload });
    const second = await app.inject({ method: 'POST', url: '/api/webhooks/meta/whatsapp', headers, payload });
    expect(first.json().deduped).toBe(false);
    expect(second.json().deduped).toBe(true);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(enqueuer.ids).toHaveLength(1);
  });
});
