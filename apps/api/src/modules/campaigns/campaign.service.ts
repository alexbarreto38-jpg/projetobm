import { createHash } from 'node:crypto';
import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import type { CreateCampaignInput } from '@wise/validation';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import type { CampaignProcessingEnqueuer } from '../../queue/enqueuer.js';
import { CampaignPreflightService } from './preflight.service.js';

/**
 * CampaignService (spec §23, §24, §39, §55). Cria a campanha e seus alvos,
 * executa o preflight de compliance e controla o ciclo de vida. A geração de
 * jobs de envio acontece no worker (nunca em loop no request — spec §18).
 */
export class CampaignService {
  private readonly preflight: CampaignPreflightService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly enqueuer?: CampaignProcessingEnqueuer,
  ) {
    this.preflight = new CampaignPreflightService(prisma);
  }

  async create(ctx: AuthContext, organizationId: string, input: CreateCampaignInput) {
    assertPermission(ctx, organizationId, 'campaign:write');

    const template = await this.prisma.template.findFirst({
      where: { id: input.templateId, organizationId },
    });
    if (!template) throw notFound('Template não encontrado.');

    const accountIds = [...new Set(input.accountIds)];
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { id: { in: accountIds }, organizationId },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw badRequest('Uma ou mais contas não pertencem a esta organização.');
    }

    // Números específicos (opcional) devem pertencer às contas selecionadas.
    let numbers: { id: string; whatsappAccountId: string }[] = [];
    if (input.phoneNumberIds?.length) {
      numbers = await this.prisma.phoneNumber.findMany({
        where: {
          id: { in: input.phoneNumberIds },
          organizationId,
          whatsappAccountId: { in: accountIds },
        },
        select: { id: true, whatsappAccountId: true },
      });
      if (numbers.length !== input.phoneNumberIds.length) {
        throw badRequest('Um ou mais números não pertencem às contas selecionadas.');
      }
    }

    const idempotencyKey = createHash('sha256')
      .update(`${organizationId}:${input.name}:${input.templateId}`)
      .digest('hex');
    const existing = await this.prisma.campaign.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          organizationId,
          name: input.name,
          templateId: input.templateId,
          status: 'DRAFT',
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          idempotencyKey,
        },
      });
      if (numbers.length > 0) {
        await tx.campaignTarget.createMany({
          data: numbers.map((n) => ({
            organizationId,
            campaignId: created.id,
            whatsappAccountId: n.whatsappAccountId,
            phoneNumberId: n.id,
          })),
        });
      } else {
        await tx.campaignTarget.createMany({
          data: accountIds.map((accountId) => ({
            organizationId,
            campaignId: created.id,
            whatsappAccountId: accountId,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: ctx.userId,
          action: 'USER_CREATED_CAMPAIGN',
          entityType: 'campaign',
          entityId: created.id,
        },
      });
      return created;
    });

    return campaign;
  }

  async list(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'campaign:read');
    return this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true, language: true, category: true } } },
    });
  }

  async get(ctx: AuthContext, organizationId: string, campaignId: string) {
    assertPermission(ctx, organizationId, 'campaign:read');
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { targets: true },
    });
    if (!campaign) throw notFound('Campanha não encontrada.');
    return campaign;
  }

  /** Executa o preflight sem iniciar (preview — spec §39 etapa 5). */
  async runPreflight(ctx: AuthContext, organizationId: string, campaignId: string) {
    assertPermission(ctx, organizationId, 'campaign:read');
    await this.get(ctx, organizationId, campaignId);
    return this.preflight.run(organizationId, campaignId);
  }

  /** Inicia a campanha após preflight (spec §24, §39). BLOCKED nunca inicia. */
  async start(
    ctx: AuthContext,
    organizationId: string,
    campaignId: string,
    acknowledgeWarnings = false,
  ) {
    assertPermission(ctx, organizationId, 'campaign:execute');
    const campaign = await this.get(ctx, organizationId, campaignId);
    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
      throw badRequest(`Campanha não pode ser iniciada no estado ${campaign.status}.`);
    }

    const report = await this.preflight.run(organizationId, campaignId);
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { preflightResult: report.result, preflightReport: report as object },
    });

    if (report.result === 'BLOCKED') {
      throw new AppError(422, 'PREFLIGHT_BLOCKED', 'Preflight bloqueou a campanha.', report);
    }
    if (report.result === 'WARNING' && !acknowledgeWarnings) {
      throw new AppError(409, 'PREFLIGHT_WARNING', 'Há avisos no preflight.', report);
    }

    const scheduled = campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: scheduled ? 'SCHEDULED' : 'RUNNING',
        startedAt: scheduled ? null : new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: ctx.userId,
        action: 'USER_STARTED_CAMPAIGN',
        entityType: 'campaign',
        entityId: campaignId,
      },
    });

    if (!scheduled && this.enqueuer) await this.enqueuer.enqueue(campaignId);
    return { campaign: updated, preflight: report };
  }

  async pause(ctx: AuthContext, organizationId: string, campaignId: string) {
    assertPermission(ctx, organizationId, 'campaign:execute');
    const campaign = await this.get(ctx, organizationId, campaignId);
    if (campaign.status !== 'RUNNING') throw badRequest('Só campanhas em execução podem pausar.');
    await this.audit(ctx, organizationId, campaignId, 'CAMPAIGN_PAUSED');
    return this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
  }

  /** Cancela: interrompe a geração de novos jobs (spec §55). */
  async cancel(ctx: AuthContext, organizationId: string, campaignId: string) {
    assertPermission(ctx, organizationId, 'campaign:execute');
    const campaign = await this.get(ctx, organizationId, campaignId);
    const terminal = ['COMPLETED', 'CANCELLED', 'FAILED'];
    if (terminal.includes(campaign.status)) throw badRequest('Campanha já finalizada.');
    // Se ainda não estava em execução, cancela direto; senão pede cancelamento.
    const next = campaign.status === 'RUNNING' ? 'CANCEL_REQUESTED' : 'CANCELLED';
    await this.audit(ctx, organizationId, campaignId, 'CAMPAIGN_CANCELLED');
    return this.prisma.campaign.update({ where: { id: campaignId }, data: { status: next } });
  }

  private async audit(
    ctx: AuthContext,
    organizationId: string,
    campaignId: string,
    action: string,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId: ctx.userId, action, entityType: 'campaign', entityId: campaignId },
    });
  }
}
