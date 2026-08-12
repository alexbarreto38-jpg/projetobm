import { prisma } from '@wise/database';
import { captureException, initSentry, logger } from '@wise/logger';
import { apiEnvSchema, parseEnv } from '@wise/validation';
import { buildApp } from './app.js';
import { maybeResetPasswordFromEnv } from './adminReset.js';
import { createGracefulShutdown } from './shutdown.js';
import { buildMetaContext, type MetaContext } from './meta/context.js';
import { createRedisConnection, createQueueCounters } from '@wise/queue';
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
  // Fail-fast: valida todo o ambiente e lista os problemas de uma vez (spec §46).
  const env = parseEnv(apiEnvSchema);
  const authSecret = env.AUTH_SECRET;

  // Recuperação de acesso (opcional): se ADMIN_PASSWORD_RESET estiver definida,
  // redefine a senha do usuário no boot. Remover a variável depois de usar.
  await maybeResetPasswordFromEnv(prisma);

  // Contexto Meta é opcional: só habilita as rotas /meta quando as variáveis
  // estiverem presentes (permite subir a API sem credenciais na Fase 1). O
  // schema já garante que, se houver Meta, o trio completo existe.
  let meta: MetaContext | undefined;
  if (env.META_APP_ID && env.META_APP_SECRET && env.ENCRYPTION_KEY) {
    meta = buildMetaContext({
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      graphBaseUrl: env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com',
      graphVersion: env.META_GRAPH_VERSION ?? 'v23.0',
      encryptionKey: env.ENCRYPTION_KEY,
      encryptionKeyPrevious: env.ENCRYPTION_KEY_PREVIOUS,
      configId: env.META_CONFIG_ID,
      defaultRedirectUri: env.META_REDIRECT_URI,
      webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
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
  let queueMetrics: (() => Promise<Record<string, Record<string, number>>>) | undefined;
  let checkRedis: (() => Promise<void>) | undefined;
  let redisConnection: ReturnType<typeof createRedisConnection> | undefined;
  if (env.REDIS_URL) {
    webhookEnqueuer = new BullMqWebhookEnqueuer(env.REDIS_URL);
    templateDeploymentEnqueuer = new BullMqTemplateDeploymentEnqueuer(env.REDIS_URL);
    contactImportEnqueuer = new BullMqContactImportEnqueuer(env.REDIS_URL);
    campaignProcessingEnqueuer = new BullMqCampaignProcessingEnqueuer(env.REDIS_URL);
    messageSendEnqueuer = new BullMqMessageSendEnqueuer(env.REDIS_URL);
    redisConnection = createRedisConnection(env.REDIS_URL);
    const counters = createQueueCounters(redisConnection);
    queueMetrics = () => counters.getCounts();
    checkRedis = async () => {
      await redisConnection!.ping();
    };
  } else {
    logger.warn('REDIS_URL ausente — jobs não serão enfileirados.');
  }

  // COOKIE_SECURE permite desligar o flag Secure quando servindo por HTTP
  // (ex.: Docker local). Sem ele, o padrão é secure em produção.
  const secureCookies = env.COOKIE_SECURE ?? env.NODE_ENV === 'production';

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
    queueMetrics,
    checkRedis,
  });

  // Plataformas gerenciadas (ex.: Render) injetam a porta em `PORT` e roteiam o
  // tráfego/health check para ela. Honramos `PORT` primeiro para não subir
  // ouvindo numa porta que o orquestrador não conhece (health check falharia e
  // o deploy seria marcado como "failed").
  const port = Number(process.env.PORT) || env.API_PORT || 3001;
  const host = env.API_HOST ?? '0.0.0.0';
  await app.listen({ port, host });
  logger.info({ port, host }, 'API iniciada');

  // Encerramento gracioso (spec §26): num redeploy/scale-down, o orquestrador
  // manda SIGTERM. Paramos de aceitar novas conexões e drenamos as em voo
  // (app.close), depois fechamos Postgres e Redis. A lógica vive em ./shutdown
  // para ser testada de forma determinística.
  const shutdown = createGracefulShutdown({
    logger,
    onExit: (code) => process.exit(code),
    closers: [
      { name: 'http', close: () => app.close() },
      { name: 'prisma', close: () => prisma.$disconnect() },
      ...(redisConnection ? [{ name: 'redis', close: () => redisConnection.quit() }] : []),
    ],
  });
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (err) => {
  logger.error(err, 'Falha ao iniciar a API');
  await captureException(err, { phase: 'bootstrap' });
  process.exit(1);
});
