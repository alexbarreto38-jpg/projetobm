import { createQueue, createRedisConnection, QUEUE_NAMES, type Queue } from '@wise/queue';
import type { WebhookEnqueuer } from './enqueuer.js';

/**
 * Enqueuer de webhooks apoiado no BullMQ/Redis (produção). Em testes usamos um
 * fake em memória (sem Redis).
 */
export class BullMqWebhookEnqueuer implements WebhookEnqueuer {
  private readonly queue: Queue<{ webhookEventId: string }>;

  constructor(redisUrl: string) {
    const connection = createRedisConnection(redisUrl);
    this.queue = createQueue(QUEUE_NAMES.webhookProcessing, connection);
  }

  async enqueue(webhookEventId: string): Promise<void> {
    await this.queue.add(
      'process',
      { webhookEventId },
      // Idempotência do job: mesmo evento não cria dois jobs (spec §19).
      // jobId não pode conter ':' (restrição do BullMQ).
      { jobId: `webhook_${webhookEventId}` },
    );
  }
}
