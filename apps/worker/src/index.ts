import { prisma } from '@wise/database';
import { logger } from '@wise/logger';
import { createRedisConnection, createWorker, QUEUE_NAMES } from '@wise/queue';
import { buildWorkerMeta } from './meta.js';
import { processContactImport } from './processors/contactImport.js';
import { processTemplateDeployment } from './processors/templateDeployment.js';
import { processWebhookEvent } from './processors/webhook.js';

/**
 * Processo de workers (spec §26). Fase 4: consome a fila webhook-processing.
 * As demais filas (deployments, campanhas, envio, sync) entram nas próximas
 * fases reutilizando esta mesma infraestrutura.
 */
async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL ausente.');

  const connection = createRedisConnection(redisUrl);

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

  webhookWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job de webhook falhou');
  });

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
  deploymentWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job de deployment falhou');
  });

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
  importWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job de importação falhou');
  });

  logger.info(
    'Workers iniciados: webhook-processing, meta-template-deployment, contact-import',
  );

  const shutdown = async () => {
    logger.info('Encerrando workers...');
    await webhookWorker.close();
    await deploymentWorker.close();
    await importWorker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(err, 'Falha ao iniciar workers');
  process.exit(1);
});
