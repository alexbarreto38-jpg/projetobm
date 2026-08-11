import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  extractSessionCookie,
  hasDb,
  makePrisma,
  resetDb,
} from './helpers.js';

describe.skipIf(!hasDb)('auth integration', () => {
  const prisma = makePrisma();
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

  const signup = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email,
        password: 'a-strong-password',
        organizationName: 'Minha Empresa',
      },
    });

  it('registra usuário, cria organização e associação ORGANIZATION_ADMIN', async () => {
    const res = await signup('owner@x.com');
    expect(res.statusCode).toBe(201);
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    expect(cookie).toContain('wise_session=');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.user.email).toBe('owner@x.com');
    const orgIds = Object.keys(body.user.memberships);
    expect(orgIds).toHaveLength(1);
    expect(body.user.memberships[orgIds[0]!]).toBe('ORGANIZATION_ADMIN');
  });

  it('recusa e-mail duplicado com 409', async () => {
    await signup('dup@x.com');
    const res = await signup('dup@x.com');
    expect(res.statusCode).toBe(409);
  });

  it('valida entrada (e-mail inválido → 400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'not-an-email', password: 'a-strong-password', organizationName: 'X' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('faz login e rejeita senha errada com mensagem genérica', async () => {
    await signup('login@x.com');
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@x.com', password: 'a-strong-password' },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@x.com', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('exige autenticação em /auth/me (401 sem cookie)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
