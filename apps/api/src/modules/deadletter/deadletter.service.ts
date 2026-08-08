import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { QUEUE_NAMES } from '@wise/queue';
import { badRequest, notFound } from '../../lib/errors.js';
import type { Requeuers } from '../../queue/enqueuer.js';

/** Campo de id da entidade em cada fila (para o requeue). */
const ID_FIELD: Record<string, string> = {
  [QUEUE_NAMES.webhookProcessing]: 'webhookEventId',
  [QUEUE_NAMES.metaTemplateDeployment]: 'deploymentId',
  [QUEUE_NAMES.contactImport]: 'contactImportId',
  [QUEUE_NAMES.campaignProcessing]: 'campaignId',
  [QUEUE_NAMES.messageSend]: 'messageId',
};

/**
 * DeadLetterService (spec §56). Lista jobs falhos definitivamente e permite
 * retry manual — que re-executa o job (o processador re-valida) — ou descarte.
 * Nada de "reenviar tudo" cego.
 */
export class DeadLetterService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly requeuers: Requeuers = {},
  ) {}

  async list(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'report:read');
    return this.prisma.deadLetterJob.findMany({
      where: { organizationId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async dismiss(ctx: AuthContext, organizationId: string, id: string) {
    assertPermission(ctx, organizationId, 'campaign:execute');
    const entry = await this.requireEntry(organizationId, id);
    return this.prisma.deadLetterJob.update({
      where: { id: entry.id },
      data: { resolvedAt: new Date() },
    });
  }

  /** Reenfileira o job original; o processador re-valida antes de agir (§56). */
  async requeue(ctx: AuthContext, organizationId: string, id: string) {
    assertPermission(ctx, organizationId, 'campaign:execute');
    const entry = await this.requireEntry(organizationId, id);
    const enqueue = this.requeuers[entry.queue];
    if (!enqueue) throw badRequest(`Fila ${entry.queue} não suporta requeue nesta instância.`);

    const field = ID_FIELD[entry.queue];
    const entityId = field ? (entry.data as Record<string, string>)[field] : undefined;
    if (!entityId) throw badRequest('Não foi possível identificar a entidade do job.');

    await enqueue(entityId);
    return this.prisma.deadLetterJob.update({
      where: { id: entry.id },
      data: { resolvedAt: new Date() },
    });
  }

  private async requireEntry(organizationId: string, id: string) {
    const entry = await this.prisma.deadLetterJob.findFirst({ where: { id, organizationId } });
    if (!entry) throw notFound('Registro não encontrado.');
    return entry;
  }
}
