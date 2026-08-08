import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { extractSessionCookie, hasDb, makePrisma, resetDb, TEST_AUTH_SECRET } from './helpers.js';

describe.skipIf(!hasDb)('LGPD integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ prisma, authSecret: TEST_AUTH_SECRET, secureCookies: false, enableRateLimit: false });
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
      payload: { email, password: 'a-strong-password', organizationName: 'Empresa X' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    return { cookie, orgId, slug: org!.slug };
  }

  it('exporta dados pessoais/operacionais com contagens (sem segredos)', async () => {
    const { cookie, orgId } = await setup('l1@x.com');
    await prisma.contact.create({ data: { organizationId: orgId, phone: '+5511990000001', name: 'Ana' } });

    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/data-export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts.contacts).toBe(1);
    expect(body.data.contacts[0].phone).toBe('+5511990000001');
    expect(JSON.stringify(body)).not.toContain('encryptedToken');
  });

  it('exclui toda a organização com confirmação de slug (cascade)', async () => {
    const { cookie, orgId, slug } = await setup('l2@x.com');
    await prisma.contact.create({ data: { organizationId: orgId, phone: '+5511990000002' } });

    // Slug errado é rejeitado.
    const bad = await app.inject({
      method: 'DELETE',
      url: `/api/organizations/${orgId}/data`,
      headers: { cookie },
      payload: { confirmSlug: 'errado' },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/organizations/${orgId}/data`,
      headers: { cookie },
      payload: { confirmSlug: slug },
    });
    expect(ok.statusCode).toBe(200);
    expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
    expect(await prisma.contact.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('purga dados operacionais antigos respeitando o corte', async () => {
    const { cookie, orgId } = await setup('l3@x.com');
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.message.create({
      data: { organizationId: orgId, status: 'DELIVERED', idempotencyKey: 'old', createdAt: old },
    });
    await prisma.message.create({
      data: { organizationId: orgId, status: 'DELIVERED', idempotencyKey: 'new' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/data-purge`,
      headers: { cookie },
      payload: { olderThanDays: 30 },
    });
    expect(res.json().deleted.messages).toBe(1);
    expect(await prisma.message.count({ where: { organizationId: orgId } })).toBe(1);
  });
});
