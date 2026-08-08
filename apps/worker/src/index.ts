import { prisma } from '@wise/database';
import { logger } from '@wise/logger';
import { createRedisConnection, createWorker, QUEUE_NAMES } from '@wise/queue';
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

  logger.info('Workers iniciados: webhook-processing');

  const shutdown = async () => {
    logger.info('Encerrando workers...');
    await webhookWorker.close();
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
