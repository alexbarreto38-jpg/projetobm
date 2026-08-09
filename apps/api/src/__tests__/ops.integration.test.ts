import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { hasDb, makePrisma, TEST_AUTH_SECRET } from './helpers.js';

describe.skipIf(!hasDb)('ops: métricas e rate limit', () => {
  const prisma: PrismaClient = makePrisma();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('/metrics expõe métricas Prometheus (processo + app)', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
    });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('process_cpu_seconds_total');
    expect(res.body).toContain('wise_open_alerts');
    await app.close();
  });

  it('/metrics exige token quando METRICS_TOKEN está definido', async () => {
    process.env.METRICS_TOKEN = 'secret-token';
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
    });
    const denied = await app.inject({ method: 'GET', url: '/metrics' });
    expect(denied.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
    delete process.env.METRICS_TOKEN;
  });

  it('login tem rate limit estrito (retorna 429 após o limite)', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: true,
    });
    let sawTooMany = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@x.com', password: 'wrong-password' },
      });
      if (res.statusCode === 429) {
        sawTooMany = true;
        break;
      }
    }
    expect(sawTooMany).toBe(true);
    await app.close();
  });
});
