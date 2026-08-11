import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { extractSessionCookie, hasDb, makePrisma, resetDb, TEST_AUTH_SECRET } from './helpers.js';

describe.skipIf(!hasDb)('observability integration (health, reports, alerts)', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
    });
  });
  beforeEach(async () => {
    await resetDb(prisma);
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

    const credential = await prisma.credential.create({
      data: { organizationId: orgId, provider: 'meta', encryptedToken: 'enc', status: 'ACTIVE' },
    });
    const connection = await prisma.metaConnection.create({
      data: { organizationId: orgId, provider: 'meta', status: 'CONNECTED', credentialId: credential.id },
    });
    const account = await prisma.whatsAppAccount.create({
      data: {
        organizationId: orgId,
        metaConnectionId: connection.id,
        externalAccountId: `WABA_${connection.id}`,
        accountModel: 'LEGACY',
      },
    });
    await prisma.phoneNumber.create({
      data: {
        organizationId: orgId,
        whatsappAccountId: account.id,
        externalPhoneNumberId: `PN_${account.id}`,
        isPaused: false,
      },
    });
    return { cookie, orgId, accountId: account.id };
  }

  it('relatório de mensagens agrega contagens e taxas', async () => {
    const { cookie, orgId } = await setup('r1@x.com');
    const statuses = ['SENT', 'DELIVERED', 'DELIVERED', 'READ', 'FAILED'];
    for (let i = 0; i < statuses.length; i += 1) {
      await prisma.message.create({
        data: {
          organizationId: orgId,
          status: statuses[i] as never,
          idempotencyKey: `m${i}`,
        },
      });
    }
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/reports/messages`,
      headers: { cookie },
    });
    const r = res.json().report;
    expect(r.counts.total).toBe(5);
    expect(r.counts.delivered).toBe(2);
    expect(r.counts.read).toBe(1);
    expect(r.counts.failed).toBe(1);
    expect(r.rates.failure).toBeCloseTo(0.2, 3);
  });

  it('exporta o relatório de mensagens em CSV (metric,value)', async () => {
    const { cookie, orgId } = await setup('rcsv@x.com');
    for (const [i, s] of ['SENT', 'DELIVERED', 'FAILED'].entries()) {
      await prisma.message.create({
        data: { organizationId: orgId, status: s as never, idempotencyKey: `mc${i}` },
      });
    }
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/reports/messages/export.csv`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toContain('metric,value');
    expect(res.body).toContain('total,3');
    expect(res.body).toContain('failed,1');
  });

  it('health da conta reflete conexão, número e templates', async () => {
    const { cookie, orgId, accountId } = await setup('r2@x.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/meta/accounts/${accountId}/health`,
      headers: { cookie },
    });
    const h = res.json().health;
    expect(h.connection.ok).toBe(true);
    expect(h.permission.ok).toBe(true);
    expect(h.number.ok).toBe(true);
    expect(h.templates.ok).toBe(false); // sem deployment aprovado
  });

  it('lista, reconhece e resolve alertas', async () => {
    const { cookie, orgId } = await setup('r3@x.com');
    const alert = await prisma.systemAlert.create({
      data: {
        organizationId: orgId,
        severity: 'CRITICAL',
        code: 'PHONE_RESTRICTED',
        title: 'Número restrito',
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/alerts`,
      headers: { cookie },
    });
    expect(list.json().alerts).toHaveLength(1);

    const ack = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/alerts/${alert.id}/acknowledge`,
      headers: { cookie },
    });
    expect(ack.json().alert.status).toBe('ACKNOWLEDGED');

    const resolve = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/alerts/${alert.id}/resolve`,
      headers: { cookie },
    });
    expect(resolve.json().alert.status).toBe('RESOLVED');

    // Resolvido some da lista de abertos.
    const after = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/alerts`,
      headers: { cookie },
    });
    expect(after.json().alerts).toHaveLength(0);
  });
});
