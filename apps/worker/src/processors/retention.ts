import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';

/**
 * Retenção/minimização (spec §44). Remove dados operacionais antigos de TODAS as
 * organizações além de `days` dias. Executado periodicamente pelo worker quando
 * RETENTION_DAYS > 0. Não toca em contatos/consentimentos (dados do titular),
 * apenas eventos e mensagens já finalizadas.
 */
export interface RetentionResult {
  cutoff: string;
  deleted: { messageEvents: number; webhookEvents: number; messages: number };
}

export async function retentionPurge(prisma: PrismaClient, days: number): Promise<RetentionResult> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [messageEvents, webhookEvents, messages] = await prisma.$transaction([
    prisma.messageEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.webhookEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.message.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } },
    }),
  ]);

  const result: RetentionResult = {
    cutoff: cutoff.toISOString(),
    deleted: {
      messageEvents: messageEvents.count,
      webhookEvents: webhookEvents.count,
      messages: messages.count,
    },
  };
  logger.info(result, 'Retenção: dados antigos removidos');
  return result;
}
