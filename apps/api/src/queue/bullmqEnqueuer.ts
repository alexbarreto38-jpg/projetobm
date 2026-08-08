import { createQueue, createRedisConnection, QUEUE_NAMES, type Queue } from '@wise/queue';
import type {
  ContactImportEnqueuer,
  TemplateDeploymentEnqueuer,
  WebhookEnqueuer,
} from './enqueuer.js';

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

export class BullMqTemplateDeploymentEnqueuer implements TemplateDeploymentEnqueuer {
  private readonly queue: Queue<{ deploymentId: string }>;

  constructor(redisUrl: string) {
    const connection = createRedisConnection(redisUrl);
    this.queue = createQueue(QUEUE_NAMES.metaTemplateDeployment, connection);
  }

  async enqueue(deploymentId: string): Promise<void> {
    await this.queue.add('submit', { deploymentId }, { jobId: `deployment_${deploymentId}` });
  }
}

export class BullMqContactImportEnqueuer implements ContactImportEnqueuer {
  private readonly queue: Queue<{ contactImportId: string }>;

  constructor(redisUrl: string) {
    const connection = createRedisConnection(redisUrl);
    this.queue = createQueue(QUEUE_NAMES.contactImport, connection);
  }

  async enqueue(contactImportId: string): Promise<void> {
    await this.queue.add('import', { contactImportId }, { jobId: `import_${contactImportId}` });
  }
}
