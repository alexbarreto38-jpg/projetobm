import { createQueue, createRedisConnection, QUEUE_NAMES, type Queue } from '@wise/queue';
import type {
  CampaignProcessingEnqueuer,
  ContactImportEnqueuer,
  MessageSendEnqueuer,
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

export class BullMqCampaignProcessingEnqueuer implements CampaignProcessingEnqueuer {
  private readonly queue: Queue<{ campaignId: string }>;
  constructor(redisUrl: string) {
    this.queue = createQueue(QUEUE_NAMES.campaignProcessing, createRedisConnection(redisUrl));
  }
  async enqueue(campaignId: string): Promise<void> {
    await this.queue.add('process', { campaignId }, { jobId: `campaign_${campaignId}` });
  }
}

export class BullMqMessageSendEnqueuer implements MessageSendEnqueuer {
  private readonly queue: Queue<{ messageId: string }>;
  constructor(redisUrl: string) {
    this.queue = createQueue(QUEUE_NAMES.messageSend, createRedisConnection(redisUrl));
  }
  async enqueue(messageId: string): Promise<void> {
    await this.queue.add('send', { messageId }, { jobId: `message_${messageId}` });
  }
}
