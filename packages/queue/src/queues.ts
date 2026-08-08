/**
 * Nomes de filas (spec §26). Workers separados consomem cada fila.
 */
export const QUEUE_NAMES = {
  metaTemplateDeployment: 'meta-template-deployment',
  campaignProcessing: 'campaign-processing',
  messageSend: 'message-send',
  webhookProcessing: 'webhook-processing',
  accountSync: 'account-sync',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Payloads tipados por fila. */
export interface JobPayloads {
  [QUEUE_NAMES.webhookProcessing]: { webhookEventId: string };
  [QUEUE_NAMES.metaTemplateDeployment]: { deploymentId: string };
  [QUEUE_NAMES.campaignProcessing]: { campaignId: string };
  [QUEUE_NAMES.messageSend]: { messageId: string };
  [QUEUE_NAMES.accountSync]: { organizationId: string; accountId: string };
  [QUEUE_NAMES.deadLetter]: { originalQueue: string; reason: string; data: unknown };
}

/**
 * Política de retry padrão (spec §27): backoff exponencial + jitter.
 * Erros permanentes devem sair do fluxo de retry no próprio worker.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 60_000 }, // 1m, 2m, 4m, 8m...
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};
