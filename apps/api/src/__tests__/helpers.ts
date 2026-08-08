import { PrismaClient } from '@wise/database';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

export const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
export const hasDb = Boolean(TEST_DB_URL);

export const TEST_AUTH_SECRET = 'test-secret-please-change-0123456789';

export function makePrisma(): PrismaClient {
  // A construção do PrismaClient é preguiçosa (não conecta até a 1ª query).
  // Quando não há banco (hasDb=false), os testes são pulados via skipIf, mas o
  // corpo do describe ainda é avaliado; usamos uma URL fictícia válida apenas
  // para não quebrar a construção nesse cenário.
  const url = TEST_DB_URL ?? 'postgresql://localhost:5432/none';
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Limpa as tabelas usadas nos testes de Fase 1 (CASCADE cobre as dependentes). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "organization_users", "organizations", "users" RESTART IDENTITY CASCADE;',
  );
}

export async function buildTestApp(prisma: PrismaClient): Promise<FastifyInstance> {
  return buildApp({
    prisma,
    authSecret: TEST_AUTH_SECRET,
    secureCookies: false,
    enableRateLimit: false,
  });
}

/** Extrai o cookie de sessão de um header set-cookie para reusar em requests. */
export function extractSessionCookie(setCookie: string | string[] | undefined): string {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const found = arr.find((c) => c.startsWith('wise_session='));
  return found ? found.split(';')[0]! : '';
}
