import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@wise/database';
import {
  buildTestApp,
  extractSessionCookie,
  hasDb,
  makePrisma,
  resetDb,
} from './helpers.js';

describe.skipIf(!hasDb)('organizations integration (isolamento + RBAC)', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp(prisma);
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function signupAndGetCookie(email: string, orgName: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'a-strong-password', organizationName: orgName },
    });
    return extractSessionCookie(res.headers['set-cookie']);
  }

  it('lista apenas as organizações do próprio usuário', async () => {
    const cookieA = await signupAndGetCookie('a@x.com', 'Empresa A');
    await signupAndGetCookie('b@x.com', 'Empresa B');

    const list = await app.inject({
      method: 'GET',
      url: '/api/organizations',
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    const orgs = list.json().organizations;
    expect(orgs).toHaveLength(1);
    expect(orgs[0].name).toBe('Empresa A');
  });

  it('bloqueia acesso a organização de outro tenant com 404 (não revela existência)', async () => {
    const cookieA = await signupAndGetCookie('a2@x.com', 'Empresa A2');
    const cookieB = await signupAndGetCookie('b2@x.com', 'Empresa B2');

    const listB = await app.inject({
      method: 'GET',
      url: '/api/organizations',
      headers: { cookie: cookieB },
    });
    const orgBId = listB.json().organizations[0].id;

    const cross = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgBId}`,
      headers: { cookie: cookieA },
    });
    expect(cross.statusCode).toBe(404);
  });

  it('RBAC: VIEWER não pode atualizar a organização (403); ADMIN pode', async () => {
    // Owner (ORGANIZATION_ADMIN) cria a org e convida um VIEWER existente.
    const ownerCookie = await signupAndGetCookie('owner3@x.com', 'Empresa 3');
    await signupAndGetCookie('viewer3@x.com', 'Org do Viewer'); // cria o usuário viewer

    const orgId = (
      await app.inject({
        method: 'GET',
        url: '/api/organizations',
        headers: { cookie: ownerCookie },
      })
    ).json().organizations[0].id;

    const invite = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'viewer3@x.com', role: 'VIEWER' },
    });
    expect(invite.statusCode).toBe(201);

    // Login como viewer para obter cookie com a nova associação.
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'viewer3@x.com', password: 'a-strong-password' },
    });
    const viewerCookie = extractSessionCookie(viewerLogin.headers['set-cookie']);

    const viewerUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}`,
      headers: { cookie: viewerCookie },
      payload: { name: 'Renomeada pelo viewer' },
    });
    expect(viewerUpdate.statusCode).toBe(403);

    const adminUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgId}`,
      headers: { cookie: ownerCookie },
      payload: { name: 'Renomeada pelo admin' },
    });
    expect(adminUpdate.statusCode).toBe(200);
    expect(adminUpdate.json().organization.name).toBe('Renomeada pelo admin');
  });

  it('exige autenticação para listar organizações (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organizations' });
    expect(res.statusCode).toBe(401);
  });
});
