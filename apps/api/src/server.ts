import { prisma } from '@wise/database';
import { logger } from '@wise/logger';
import { buildApp } from './app.js';
import { buildMetaContext, type MetaContext } from './meta/context.js';

/**
 * Bootstrap do servidor de API. Segredos vêm do ambiente; nunca hardcoded.
 * (Fase 1: auth + organizations. Webhooks/Meta entram nas fases seguintes.)
 */
async function main() {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret.length < 16) {
    throw new Error('AUTH_SECRET ausente ou muito curto (mín. 16 caracteres).');
  }

  // Contexto Meta é opcional: só habilita as rotas /meta quando as variáveis
  // estiverem presentes (permite subir a API sem credenciais na Fase 1).
  let meta: MetaContext | undefined;
  if (process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.ENCRYPTION_KEY) {
    meta = buildMetaContext({
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      graphBaseUrl: process.env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com',
      graphVersion: process.env.META_GRAPH_VERSION ?? 'v23.0',
      encryptionKey: process.env.ENCRYPTION_KEY,
      encryptionKeyPrevious: process.env.ENCRYPTION_KEY_PREVIOUS,
      configId: process.env.META_CONFIG_ID,
      defaultRedirectUri: process.env.META_REDIRECT_URI,
    });
    logger.info('Contexto Meta habilitado.');
  } else {
    logger.warn('Variáveis Meta ausentes — rotas /meta desabilitadas nesta instância.');
  }

  const app = await buildApp({
    prisma,
    authSecret,
    secureCookies: process.env.NODE_ENV === 'production',
    meta,
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
