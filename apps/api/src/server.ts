import { prisma } from '@wise/database';
import { logger } from '@wise/logger';
import { buildApp } from './app.js';

/**
 * Bootstrap do servidor de API. Segredos vêm do ambiente; nunca hardcoded.
 * (Fase 1: auth + organizations. Webhooks/Meta entram nas fases seguintes.)
 */
async function main() {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret.length < 16) {
    throw new Error('AUTH_SECRET ausente ou muito curto (mín. 16 caracteres).');
  }

  const app = await buildApp({
    prisma,
    authSecret,
    secureCookies: process.env.NODE_ENV === 'production',
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen({ port, host });
  logger.info({ port, host }, 'API iniciada');
}

main().catch((err) => {
  logger.error(err, 'Falha ao iniciar a API');
  process.exit(1);
});
