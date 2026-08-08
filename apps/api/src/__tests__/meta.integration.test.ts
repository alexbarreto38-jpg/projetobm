import type { FastifyInstance } from 'fastify';
import { MetaMockServer } from '@wise/meta-provider';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  extractSessionCookie,
  hasDb,
  makePrisma,
  makeTestMeta,
  resetDb,
} from './helpers.js';

const WABA = {
  id: 'WABA_TEST',
  name: 'Empresa Conectada',
  currency: 'BRL',
  timezone_id: 'America/Sao_Paulo',
  phone_numbers: [
    { id: 'PN_A', display_phone_number: '+55 11 90000-0001', quality_rating: 'GREEN' },
    { id: 'PN_B', display_phone_number: '+55 11 90000-0002', quality_rating: 'YELLOW' },
  ],
};

describe.skipIf(!hasDb)('meta connection integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let server: MetaMockServer;

  beforeAll(async () => {
    server = new MetaMockServer({ wabas: [WABA], exchangedToken: 'EXCHANGED_TOKEN' });
    app = await buildTestApp(prisma, makeTestMeta(server));
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function ownerCookieAndOrg(email: string) {
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

  it('conecta via token: descobre e persiste WABA + números; token cifrado em repouso', async () => {
    const { cookie, orgId } = await ownerCookieAndOrg('c1@x.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/meta/connections/token`,
      headers: { cookie },
      payload: { accessToken: 'SYS_USER_TOKEN', wabaId: 'WABA_TEST' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.account.externalAccountId).toBe('WABA_TEST');
    expect(body.account.name).toBe('Empresa Conectada');
    expect(body.account.accountModel).toBe('LEGACY');
    expect(body.phoneNumbers).toHaveLength(2);
    expect(body.health.connection).toBe(true);

    // Credencial cifrada: nunca o token puro no banco (spec §8).
    const creds = await prisma.credential.findMany({ where: { organizationId: orgId } });
    expect(creds).toHaveLength(1);
    expect(creds[0]!.encryptedToken).not.toContain('SYS_USER_TOKEN');
    expect(creds[0]!.status).toBe('ACTIVE');

    // Webhook assinado.
    expect(server.calls.some((c) => c.url.includes('/WABA_TEST/subscribed_apps'))).toBe(true);
  });

  it('conecta via Embedded Signup: troca code por token e persiste', async () => {
    const { cookie, orgId } = await ownerCookieAndOrg('c2@x.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/meta/connections/embedded-signup`,
      headers: { cookie },
      payload: { code: 'oauth-code-123', wabaId: 'WABA_TEST' },
    });
    expect(res.statusCode).toBe(201);
    expect(server.calls.some((c) => c.url.includes('/oauth/access_token'))).toBe(true);

    const accounts = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/meta/accounts`,
      headers: { cookie },
    });
    expect(accounts.json().accounts).toHaveLength(1);
  });

  it('é idempotente: reconectar a mesma WABA não duplica conta/números', async () => {
    const { cookie, orgId } = await ownerCookieAndOrg('c3@x.com');
    const connect = () =>
      app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/meta/connections/token`,
        headers: { cookie },
        payload: { accessToken: 'TOK', wabaId: 'WABA_TEST' },
      });
    await connect();
    await connect();

    const accounts = await prisma.whatsAppAccount.findMany({ where: { organizationId: orgId } });
    expect(accounts).toHaveLength(1);
    const numbers = await prisma.phoneNumber.findMany({ where: { organizationId: orgId } });
    expect(numbers).toHaveLength(2);
  });

  it('RBAC: VIEWER não pode conectar (403)', async () => {
    const { cookie: ownerCookie, orgId } = await ownerCookieAndOrg('owner4@x.com');
    // cria um viewer e o adiciona à org
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: 'viewer4@x.com',
        password: 'a-strong-password',
        organizationName: 'Viewer Org',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'viewer4@x.com', role: 'VIEWER' },
    });
    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'viewer4@x.com', password: 'a-strong-password' },
    });
    const viewerCookie = extractSessionCookie(viewerLogin.headers['set-cookie']);

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/meta/connections/token`,
      headers: { cookie: viewerCookie },
      payload: { accessToken: 'TOK', wabaId: 'WABA_TEST' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('propaga erro da Meta (token inválido → 401 AUTH), sem persistir conexão', async () => {
    const { cookie, orgId } = await ownerCookieAndOrg('c5@x.com');
    const failing = new MetaMockServer({
      wabas: [WABA],
      failOn: { '/WABA_TEST': { httpStatus: 401, code: 190, message: 'token inválido' } },
    });
    const failingApp = await buildTestApp(prisma, makeTestMeta(failing));

    const res = await failingApp.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/meta/connections/token`,
      headers: { cookie },
      payload: { accessToken: 'BAD', wabaId: 'WABA_TEST' },
    });
    expect(res.statusCode).toBe(401);
    const conns = await prisma.metaConnection.findMany({ where: { organizationId: orgId } });
    expect(conns).toHaveLength(0);
    await failingApp.close();
  });

  it('tenant isolation: não conecta em organização alheia (404)', async () => {
    const { cookie: cookieA } = await ownerCookieAndOrg('a6@x.com');
    const { orgId: orgB } = await ownerCookieAndOrg('b6@x.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgB}/meta/connections/token`,
      headers: { cookie: cookieA },
      payload: { accessToken: 'TOK', wabaId: 'WABA_TEST' },
    });
    expect(res.statusCode).toBe(404);
  });
});
