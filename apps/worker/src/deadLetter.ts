import type { PrismaClient } from '@wise/database';
import { QUEUE_NAMES, type QueueName } from '@wise/queue';
import { logger } from '@wise/logger';

/**
 * Registro de jobs que falharam definitivamente (spec §56). O admin visualiza
 * motivo/conta/campanha/data; o retry manual re-executa a validação.
 */
export async function recordDeadLetter(
  prisma: PrismaClient,
  params: { queue: QueueName; jobId?: string; reason: string; data: unknown },
): Promise<void> {
  const organizationId = await deriveOrgId(prisma, params.queue, params.data);
  await prisma.deadLetterJob.create({
    data: {
      organizationId,
      queue: params.queue,
      jobId: params.jobId,
      reason: params.reason.slice(0, 2000),
      data: (params.data ?? {}) as object,
    },
  });
  logger.warn({ queue: params.queue, jobId: params.jobId }, 'Job movido para dead-letter');
}

/** Descobre a organização dona do job pela entidade referenciada. */
async function deriveOrgId(
  prisma: PrismaClient,
  queue: QueueName,
  data: unknown,
): Promise<string | null> {
  const d = (data ?? {}) as Record<string, string | undefined>;
  try {
    switch (queue) {
      case QUEUE_NAMES.webhookProcessing:
        return d.webhookEventId
          ? (await prisma.webhookEvent.findUnique({ where: { id: d.webhookEventId } }))?.organizationId ?? null
          : null;
      case QUEUE_NAMES.metaTemplateDeployment:
        return d.deploymentId
          ? (await prisma.templateDeployment.findUnique({ where: { id: d.deploymentId } }))?.organizationId ?? null
          : null;
      case QUEUE_NAMES.campaignProcessing:
        return d.campaignId
          ? (await prisma.campaign.findUnique({ where: { id: d.campaignId } }))?.organizationId ?? null
          : null;
      case QUEUE_NAMES.messageSend:
        return d.messageId
          ? (await prisma.message.findUnique({ where: { id: d.messageId } }))?.organizationId ?? null
          : null;
      case QUEUE_NAMES.contactImport:
        return d.contactImportId
          ? (await prisma.contactImport.findUnique({ where: { id: d.contactImportId } }))?.organizationId ?? null
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** True quando o job esgotou as tentativas (falha definitiva). */
export function isFinalAttempt(attemptsMade: number, maxAttempts: number | undefined): boolean {
  return attemptsMade >= (maxAttempts ?? 1);
}
