import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { extractSessionCookie, hasDb, makePrisma, resetDb, TEST_AUTH_SECRET } from './helpers.js';

describe.skipIf(!hasDb)('audit integration', () => {
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

  it('lista os logs de auditoria da organização (registro do próprio signup)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'aud@x.com', password: 'a-strong-password', organizationName: 'Empresa' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;

    const audit = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/audit`,
      headers: { cookie },
    });
    expect(audit.statusCode).toBe(200);
    const actions = audit.json().logs.map((l: { action: string }) => l.action);
    expect(actions).toContain('USER_REGISTERED');
  });

  it('RBAC: VIEWER não tem audit:read (403)', async () => {
    const owner = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'owner-a@x.com', password: 'a-strong-password', organizationName: 'Org A' },
    });
    const ownerCookie = extractSessionCookie(owner.headers['set-cookie']);
    const orgId = Object.keys(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } })).json().user
        .memberships,
    )[0]!;
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'viewer-a@x.com', password: 'a-strong-password', organizationName: 'Org V' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'viewer-a@x.com', role: 'VIEWER' },
    });
    const vlogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'viewer-a@x.com', password: 'a-strong-password' },
    });
    const vcookie = extractSessionCookie(vlogin.headers['set-cookie']);
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/audit`,
      headers: { cookie: vcookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
