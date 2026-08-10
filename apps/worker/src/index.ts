import { prisma } from '@wise/database';
import { captureException, initSentry, logger } from '@wise/logger';
import { parseEnv, workerEnvSchema } from '@wise/validation';
import { createRedisConnection, createWorker, QUEUE_NAMES } from '@wise/queue';
import {
  CircuitBreaker,
  createQueue,
  RateLimiter,
  RedisBreakerStore,
  RedisRateStore,
} from '@wise/queue';
import { isFinalAttempt, recordDeadLetter } from './deadLetter.js';
import { buildWorkerMeta } from './meta.js';
import { processAccountSync } from './processors/accountSync.js';
import { processCampaign } from './processors/campaignProcessing.js';
import { processContactImport } from './processors/contactImport.js';
import { processMessageSend } from './processors/messageSend.js';
import { retentionPurge } from './processors/retention.js';
import { processTemplateDeployment } from './processors/templateDeployment.js';
import { processWebhookEvent } from './processors/webhook.js';

/**
 * Processo de workers (spec §26). Fase 4: consome a fila webhook-processing.
 * As demais filas (deployments, campanhas, envio, sync) entram nas próximas
 * fases reutilizando esta mesma infraestrutura.
 */
async function main() {
  await initSentry('worker');
  // Fail-fast: valida o ambiente e lista os problemas de uma vez (spec §46).
  const env = parseEnv(workerEnvSchema);
  const connection = createRedisConnection(env.REDIS_URL);

  // Handler de falha compartilhado: registra na dead-letter só quando o job
  // esgotou as tentativas (falha definitiva — spec §56).
  const onFailed =
    (queue: (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]) =>
    async (job: { id?: string; data?: unknown; attemptsMade?: number; opts?: { attempts?: number } } | undefined, err: Error) => {
      logger.error({ queue, jobId: job?.id, err: err.message }, 'Job falhou');
      void captureException(err, { queue, jobId: job?.id });
      if (job && isFinalAttempt(job.attemptsMade ?? 0, job.opts?.attempts)) {
        await recordDeadLetter(prisma, {
          queue,
          jobId: job.id,
          reason: err.message,
          data: job.data,
        }).catch((e) => logger.error({ e }, 'Falha ao registrar dead-letter'));
      }
    };

  const webhookWorker = createWorker(
    QUEUE_NAMES.webhookProcessing,
    async (job) => {
      const { webhookEventId } = job.data;
      const summary = await processWebhookEvent(prisma, webhookEventId);
      logger.info({ webhookEventId, ...summary }, 'Webhook processado');
      return summary;
    },
    connection,
  );

  webhookWorker.on('failed', onFailed(QUEUE_NAMES.webhookProcessing));

  // Worker de submissão de templates (spec §17). Requer contexto Meta.
  const meta = buildWorkerMeta();
  const deploymentWorker = createWorker(
    QUEUE_NAMES.metaTemplateDeployment,
    async (job) => {
      const { deploymentId } = job.data;
      const result = await processTemplateDeployment(prisma, meta, deploymentId);
      logger.info({ deploymentId, ...result }, 'Deployment de template processado');
      return result;
    },
    connection,
  );
  deploymentWorker.on('failed', onFailed(QUEUE_NAMES.metaTemplateDeployment));

  // Worker de importação de contatos (spec §40).
  const importWorker = createWorker(
    QUEUE_NAMES.contactImport,
    async (job) => {
      const { contactImportId } = job.data;
      const result = await processContactImport(prisma, contactImportId);
      logger.info({ contactImportId, ...result }, 'Importação de contatos processada');
      return result;
    },
    connection,
  );
  importWorker.on('failed', onFailed(QUEUE_NAMES.contactImport));

  // Fila de envio: o processamento de campanha enfileira 1 job por mensagem.
  const messageSendQueue = createQueue(QUEUE_NAMES.messageSend, connection);
  const messageEnqueuer = {
    enqueue: async (messageId: string) => {
      await messageSendQueue.add('send', { messageId }, { jobId: `message_${messageId}` });
    },
  };

  // Worker de processamento de campanhas (gera destinatários + mensagens).
  const campaignWorker = createWorker(
    QUEUE_NAMES.campaignProcessing,
    async (job) => {
      const { campaignId } = job.data;
      const result = await processCampaign(prisma, campaignId, messageEnqueuer);
      logger.info({ campaignId, ...result }, 'Campanha processada');
      return result;
    },
    connection,
  );
  campaignWorker.on('failed', onFailed(QUEUE_NAMES.campaignProcessing));

  // Circuit breaker + rate limiter por número, compartilhados via Redis (§28, §41).
  const breaker = new CircuitBreaker(new RedisBreakerStore(connection));
  const rateLimiter = new RateLimiter(new RedisRateStore(connection), {
    capacity: Number(process.env.SEND_RATE_CAPACITY ?? 60),
    refillPerSec: Number(process.env.SEND_RATE_PER_SEC ?? 10),
  });

  // Worker de envio de mensagens (chama a Meta via adapter).
  const messageWorker = createWorker(
    QUEUE_NAMES.messageSend,
    async (job) => {
      const { messageId } = job.data;
      const result = await processMessageSend(prisma, meta, messageId, breaker, rateLimiter);
      logger.info({ messageId, ...result }, 'Mensagem processada');
      return result;
    },
    connection,
  );
  messageWorker.on('failed', onFailed(QUEUE_NAMES.messageSend));

  // Worker de sincronização de contas (spec §50).
  const syncWorker = createWorker(
    QUEUE_NAMES.accountSync,
    async (job) => {
      const result = await processAccountSync(prisma, meta, job.data);
      logger.info({ ...job.data, ...result }, 'Sync de conta processado');
      return result;
    },
    connection,
  );
  syncWorker.on('failed', onFailed(QUEUE_NAMES.accountSync));

  // Agendador periódico (spec §50): enfileira sync de todas as contas conectadas.
  const accountSyncQueue = createQueue(QUEUE_NAMES.accountSync, connection);
  const syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS ?? 30 * 60 * 1000);
  const syncTimer = setInterval(() => {
    void (async () => {
      try {
        const accounts = await prisma.whatsAppAccount.findMany({
          where: { metaConnection: { status: 'CONNECTED' } },
          select: { id: true, organizationId: true },
        });
        for (const a of accounts) {
          await accountSyncQueue.add(
            'sync',
            { organizationId: a.organizationId, accountId: a.id },
            { jobId: `sync_${a.id}_${Math.floor(Date.now() / syncIntervalMs)}` },
          );
        }
      } catch (err) {
        logger.error({ err }, 'Falha ao agendar sync de contas');
      }
    })();
  }, syncIntervalMs);
  syncTimer.unref();

  // Cron de retenção LGPD (spec §44): purga dados operacionais antigos quando
  // RETENTION_DAYS > 0. Desligado por padrão.
  const retentionDays = Number(process.env.RETENTION_DAYS ?? 0);
  let retentionTimer: NodeJS.Timeout | undefined;
  if (retentionDays > 0) {
    const intervalMs = Number(process.env.RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
    const run = () => {
      void retentionPurge(prisma, retentionDays).catch((err) =>
        logger.error({ err }, 'Falha na retenção'),
      );
    };
    run(); // executa uma vez no start
    retentionTimer = setInterval(run, intervalMs);
    retentionTimer.unref();
    logger.info({ retentionDays }, 'Cron de retenção habilitado');
  }

  logger.info(
    'Workers iniciados: webhook-processing, meta-template-deployment, contact-import, campaign-processing, message-send, account-sync',
  );

  const shutdown = async () => {
    logger.info('Encerrando workers...');
    await webhookWorker.close();
    await deploymentWorker.close();
    await importWorker.close();
    await campaignWorker.close();
    await messageWorker.close();
    await syncWorker.close();
    clearInterval(syncTimer);
    if (retentionTimer) clearInterval(retentionTimer);
    await messageSendQueue.close();
    await accountSyncQueue.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(async (err) => {
  logger.error(err, 'Falha ao iniciar workers');
  await captureException(err, { phase: 'bootstrap' });
  process.exit(1);
});
