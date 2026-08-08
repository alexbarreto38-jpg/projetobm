import { prisma } from '@wise/database';
import { captureException, initSentry, logger } from '@wise/logger';
import { buildApp } from './app.js';
import { buildMetaContext, type MetaContext } from './meta/context.js';
import {
  BullMqCampaignProcessingEnqueuer,
  BullMqContactImportEnqueuer,
  BullMqMessageSendEnqueuer,
  BullMqTemplateDeploymentEnqueuer,
  BullMqWebhookEnqueuer,
} from './queue/bullmqEnqueuer.js';
import type {
  CampaignProcessingEnqueuer,
  ContactImportEnqueuer,
  MessageSendEnqueuer,
  TemplateDeploymentEnqueuer,
  WebhookEnqueuer,
} from './queue/enqueuer.js';

/**
 * Bootstrap do servidor de API. Segredos vêm do ambiente; nunca hardcoded.
 * (Fase 1: auth + organizations. Webhooks/Meta entram nas fases seguintes.)
 */
async function main() {
  await initSentry('api');
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
      webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    });
    logger.info('Contexto Meta habilitado.');
  } else {
    logger.warn('Variáveis Meta ausentes — rotas /meta desabilitadas nesta instância.');
  }

  let webhookEnqueuer: WebhookEnqueuer | undefined;
  let templateDeploymentEnqueuer: TemplateDeploymentEnqueuer | undefined;
  let contactImportEnqueuer: ContactImportEnqueuer | undefined;
  let campaignProcessingEnqueuer: CampaignProcessingEnqueuer | undefined;
  let messageSendEnqueuer: MessageSendEnqueuer | undefined;
  if (process.env.REDIS_URL) {
    webhookEnqueuer = new BullMqWebhookEnqueuer(process.env.REDIS_URL);
    templateDeploymentEnqueuer = new BullMqTemplateDeploymentEnqueuer(process.env.REDIS_URL);
    contactImportEnqueuer = new BullMqContactImportEnqueuer(process.env.REDIS_URL);
    campaignProcessingEnqueuer = new BullMqCampaignProcessingEnqueuer(process.env.REDIS_URL);
    messageSendEnqueuer = new BullMqMessageSendEnqueuer(process.env.REDIS_URL);
  } else {
    logger.warn('REDIS_URL ausente — jobs não serão enfileirados.');
  }

  // COOKIE_SECURE permite desligar o flag Secure quando servindo por HTTP
  // (ex.: Docker local). Sem ele, o padrão é secure em produção.
  const secureCookies =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';

  const app = await buildApp({
    prisma,
    authSecret,
    secureCookies,
    meta,
    webhookEnqueuer,
    templateDeploymentEnqueuer,
    contactImportEnqueuer,
    campaignProcessingEnqueuer,
    messageSendEnqueuer,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen({ port, host });
  logger.info({ port, host }, 'API iniciada');
}

main().catch(async (err) => {
  logger.error(err, 'Falha ao iniciar a API');
  await captureException(err, { phase: 'bootstrap' });
  process.exit(1);
});
