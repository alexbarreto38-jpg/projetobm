import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import { badRequest, notFound } from '../../lib/errors.js';
import type { TemplateDeploymentEnqueuer } from '../../queue/enqueuer.js';

/** Estados a partir dos quais uma re-replicação pode reenfileirar a submissão. */
const RESUBMITTABLE = new Set(['DRAFT', 'ERROR', 'REJECTED']);

/**
 * TemplateDeploymentService (spec §17, §18, §52).
 *
 * Replicar um template em N contas NÃO é uma operação única: cria/atualiza uma
 * linha em template_deployments por conta e enfileira um job por conta (fila
 * meta-template-deployment). Nunca faz loop de chamadas à Meta dentro do request.
 * Idempotente por (templateId, targetAccountId).
 */
export class TemplateDeploymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enqueuer?: TemplateDeploymentEnqueuer,
  ) {}

  async replicate(
    ctx: AuthContext,
    organizationId: string,
    templateId: string,
    targetAccountIds: string[],
  ) {
    assertPermission(ctx, organizationId, 'template:write');

    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!template) throw notFound('Template não encontrado.');

    // Só contas pertencentes à organização (spec §53).
    const uniqueIds = [...new Set(targetAccountIds)];
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { id: { in: uniqueIds }, organizationId },
      select: { id: true },
    });
    if (accounts.length !== uniqueIds.length) {
      throw badRequest('Uma ou mais contas não pertencem a esta organização.');
    }

    const deployments = [];
    for (const accountId of uniqueIds) {
      const existing = await this.prisma.templateDeployment.findUnique({
        where: { templateId_targetAccountId: { templateId, targetAccountId: accountId } },
      });

      let deployment;
      let shouldEnqueue = false;

      if (!existing) {
        deployment = await this.prisma.templateDeployment.create({
          data: {
            organizationId,
            templateId,
            targetAccountId: accountId,
            status: 'QUEUED',
            idempotencyKey: `tpl_${templateId}_acc_${accountId}`,
          },
        });
        shouldEnqueue = true;
      } else if (RESUBMITTABLE.has(existing.status)) {
        deployment = await this.prisma.templateDeployment.update({
          where: { id: existing.id },
          data: {
            status: 'QUEUED',
            errorCode: null,
            errorSubcode: null,
            errorMessage: null,
            fbtraceId: null,
          },
        });
        shouldEnqueue = true;
      } else {
        // Já em andamento/concluído: não duplica nem reenfileira.
        deployment = existing;
      }

      if (shouldEnqueue) await this.enqueue(deployment.id);
      deployments.push(deployment);
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: ctx.userId,
        action: 'TEMPLATE_REPLICATED',
        entityType: 'template',
        entityId: templateId,
        metadata: { accounts: uniqueIds.length },
      },
    });

    return deployments;
  }

  /** Visão do Bulk Manager: status por conta (spec §52). */
  async listByTemplate(ctx: AuthContext, organizationId: string, templateId: string) {
    assertPermission(ctx, organizationId, 'template:read');
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!template) throw notFound('Template não encontrado.');
    return this.prisma.templateDeployment.findMany({
      where: { templateId, organizationId },
      include: { targetAccount: { select: { id: true, name: true, externalAccountId: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async enqueue(deploymentId: string) {
    if (!this.enqueuer) {
      logger.warn({ deploymentId }, 'Sem enqueuer: deployment não enfileirado');
      return;
    }
    try {
      await this.enqueuer.enqueue(deploymentId);
    } catch (err) {
      logger.error({ err, deploymentId }, 'Falha ao enfileirar deployment');
    }
  }
}
