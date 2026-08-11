import type { PrismaClient } from '@wise/database';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { hasDb, makePrisma, TEST_AUTH_SECRET } from './helpers.js';

describe.skipIf(!hasDb)('ops: métricas e rate limit', () => {
  const prisma: PrismaClient = makePrisma();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('/health é liveness simples (200 sem tocar dependências)', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('/ready confirma Postgres up e reporta Redis como skipped quando ausente', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready', checks: { db: 'up', redis: 'skipped' } });
    await app.close();
  });

  it('/ready retorna 503 quando o Redis está down', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      checkRedis: async () => {
        throw new Error('redis unreachable');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'unready', checks: { db: 'up', redis: 'down' } });
    await app.close();
  });

  it('/ready vira 503 (não trava) quando a checagem de Redis não responde', async () => {
    const app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      // Simula Redis reconectando: a promise nunca resolve — o timeout do /ready
      // deve garantir 503 rápido em vez de pendurar o probe.
      checkRedis: () => new Promise<void>(() => {}),
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ checks: { redis: 'down' } });
    await app.close();
  }, 10_000);

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
