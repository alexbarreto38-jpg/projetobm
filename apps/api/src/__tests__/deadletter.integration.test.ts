import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { MessageSendEnqueuer } from '../queue/enqueuer.js';
import { extractSessionCookie, hasDb, makePrisma, resetDb, TEST_AUTH_SECRET } from './helpers.js';

class FakeMsgEnqueuer implements MessageSendEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string): Promise<void> {
    this.ids.push(id);
  }
}

describe.skipIf(!hasDb)('dead-letter integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let enqueuer: FakeMsgEnqueuer;

  beforeAll(async () => {
    enqueuer = new FakeMsgEnqueuer();
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      messageSendEnqueuer: enqueuer,
    });
  });
  beforeEach(async () => {
    await resetDb(prisma);
    enqueuer.ids.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'a-strong-password', organizationName: 'Empresa' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;
    return { cookie, orgId };
  }

  it('lista, reprocessa (reenfileira) e descarta jobs da dead-letter', async () => {
    const { cookie, orgId } = await setup('dl1@x.com');
    const message = await prisma.message.create({
      data: { organizationId: orgId, status: 'FAILED', idempotencyKey: 'k1' },
    });
    const entry = await prisma.deadLetterJob.create({
      data: {
        organizationId: orgId,
        queue: 'message-send',
        jobId: 'message_x',
        reason: 'erro permanente',
        data: { messageId: message.id },
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/dead-letters`,
      headers: { cookie },
    });
    expect(list.json().deadLetters).toHaveLength(1);

    // Requeue re-enfileira a mensagem (o worker re-valida) e marca resolvido.
    const requeue = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/dead-letters/${entry.id}/requeue`,
      headers: { cookie },
    });
    expect(requeue.statusCode).toBe(200);
    expect(enqueuer.ids).toContain(message.id);

    // Some da lista após resolver.
    const after = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/dead-letters`,
      headers: { cookie },
    });
    expect(after.json().deadLetters).toHaveLength(0);
  });

  it('descarta (dismiss) sem reenfileirar', async () => {
    const { cookie, orgId } = await setup('dl2@x.com');
    const entry = await prisma.deadLetterJob.create({
      data: { organizationId: orgId, queue: 'webhook-processing', reason: 'x', data: {} },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/dead-letters/${entry.id}/dismiss`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(enqueuer.ids).toHaveLength(0);
  });
});
