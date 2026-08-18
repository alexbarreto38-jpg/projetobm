import { can, type AuthContext } from '@wise/auth';
import type {
  AssistantBackend,
  AssistantContext,
  AuditEntry,
  BalanceInfo,
  CampaignReportData,
  CampaignStatusData,
  CostEstimate,
  ListValidationResult,
  RechargePreparation,
  Sender,
  TemplateInfo,
} from '@wise/assistant';
import type { PrismaClient } from '@wise/database';
import type { CampaignSlots } from '@wise/assistant';
import { CampaignService } from '../campaigns/campaign.service.js';

/**
 * Adaptador que liga o "cérebro" (@wise/assistant) aos serviços reais deste
 * backend (Meta oficial — spec §1, §26). As capacidades que a infraestrutura da
 * Meta NÃO expõe (saldo pré-pago, custo unitário simples, recarga por API) são
 * reportadas honestamente com `supported:false`, em vez de inventadas
 * (spec §11, §12, §24). Toda operação reforça permissão/isolamento no próprio
 * backend — nunca confiando no modelo (spec §19).
 */
export class PrismaAssistantBackend implements AssistantBackend {
  private readonly campaigns: CampaignService;

  constructor(
    private readonly prisma: PrismaClient,
    campaigns?: CampaignService,
  ) {
    this.campaigns = campaigns ?? new CampaignService(prisma);
  }

  /** Recupera o AuthContext do backend anexado ao AssistantContext. */
  private auth(ctx: AssistantContext): AuthContext {
    const auth = (ctx as ApiAssistantContext).auth;
    if (!auth) throw new Error('Contexto de autenticação ausente.');
    return auth;
  }

  async listSenders(ctx: AssistantContext): Promise<Sender[]> {
    const numbers = await this.prisma.phoneNumber.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return numbers.map((n) => ({
      id: n.id,
      label: n.verifiedName ?? n.displayPhoneNumber ?? n.externalPhoneNumberId,
      phone: n.displayPhoneNumber ?? '',
      displayNumber: lastFour(n.displayPhoneNumber),
      paused: n.isPaused,
    }));
  }

  async resolveSender(ctx: AssistantContext, query: string): Promise<Sender[]> {
    const q = query.toLowerCase().replace(/\s+/g, '');
    const senders = await this.listSenders(ctx);
    const digits = q.replace(/\D/g, '');
    return senders.filter((s) => {
      const hay = `${s.label} ${s.phone} ${s.displayNumber ?? ''}`.toLowerCase();
      const phoneDigits = s.phone.replace(/\D/g, '');
      return (
        hay.replace(/\s+/g, '').includes(q) ||
        (digits.length >= 3 && phoneDigits.includes(digits))
      );
    });
  }

  async listTemplates(ctx: AssistantContext): Promise<TemplateInfo[]> {
    const templates = await this.prisma.template.findMany({
      where: { organizationId: ctx.organizationId },
      include: { deployments: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(templates.map((t) => this.toTemplateInfo(ctx, t)));
  }

  async getTemplate(ctx: AssistantContext, nameOrId: string): Promise<TemplateInfo | null> {
    const template = await this.prisma.template.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ id: nameOrId }, { name: nameOrId }],
      },
      include: { deployments: true },
    });
    if (!template) return null;
    return this.toTemplateInfo(ctx, template);
  }

  private async toTemplateInfo(
    ctx: AssistantContext,
    template: {
      id: string;
      name: string;
      category: string;
      language: string;
      components: unknown;
      deployments: { status: string; targetAccountId: string }[];
    },
  ): Promise<TemplateInfo> {
    const approvedAccountIds = template.deployments
      .filter((d) => d.status === 'APPROVED')
      .map((d) => d.targetAccountId);
    const anyPending = template.deployments.some((d) =>
      ['QUEUED', 'SUBMITTED', 'PENDING'].includes(d.status),
    );
    const status =
      approvedAccountIds.length > 0 ? 'APPROVED' : anyPending ? 'PENDING' : 'NOT_APPROVED';

    // Números que pertencem às contas onde o template está aprovado (spec §9).
    let approvedSenderIds: string[] = [];
    if (approvedAccountIds.length > 0) {
      const numbers = await this.prisma.phoneNumber.findMany({
        where: { organizationId: ctx.organizationId, whatsappAccountId: { in: approvedAccountIds } },
        select: { id: true },
      });
      approvedSenderIds = numbers.map((n) => n.id);
    }

    const { body, variables } = parseComponents(template.components);
    return {
      id: template.id,
      name: template.name,
      status,
      category: template.category,
      language: template.language,
      variables,
      bodyText: body,
      approvedSenderIds,
    };
  }

  async validateContactList(ctx: AssistantContext, listRef: string): Promise<ListValidationResult> {
    const imp = await this.prisma.contactImport.findFirst({
      where: { id: listRef, organizationId: ctx.organizationId },
    });
    if (!imp) throw new Error(`Lista/import "${listRef}" não encontrada.`);
    // Uma linha de exemplo real ajuda a montar a prévia (spec §13).
    const sample = await this.prisma.contact.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const sampleRow = sample
      ? { nome: sample.name ?? '', telefone: sample.phone }
      : undefined;
    return {
      listRef: imp.id,
      total: imp.totalRows,
      valid: imp.imported,
      invalid: imp.invalid,
      duplicated: imp.duplicates,
      missingRequired: 0,
      // O import atual normaliza para (nome, telefone); colunas custom exigiriam
      // preservar o cabeçalho original (evolução futura).
      columns: ['nome', 'telefone'],
      sampleRow,
    };
  }

  // Meta oficial não expõe saldo pré-pago simples pela Graph API neste modelo
  // (spec §11). Reportamos honestamente que não é suportado.
  getBalance(_ctx: AssistantContext): Promise<BalanceInfo> {
    return Promise.resolve({ available: null, currency: 'BRL', supported: false });
  }

  // Preço por conversa da Meta é variável por país/categoria; não expomos uma
  // estimativa simples aqui (spec §11). Evolução: tabela de preços por mercado.
  estimateCost(_ctx: AssistantContext, count: number): Promise<CostEstimate> {
    return Promise.resolve({ count, unitCost: null, totalCost: null, currency: 'BRL', supported: false });
  }

  async createCampaign(
    ctx: AssistantContext,
    _draftId: string,
    slots: CampaignSlots,
  ): Promise<{ backendCampaignId: string }> {
    if (!slots.senderId || !slots.templateId) {
      throw new Error('Remetente e template são obrigatórios para criar a campanha.');
    }
    const number = await this.prisma.phoneNumber.findFirst({
      where: { id: slots.senderId, organizationId: ctx.organizationId },
      select: { whatsappAccountId: true },
    });
    if (!number) throw new Error('Remetente não encontrado.');

    const campaign = await this.campaigns.create(this.auth(ctx), ctx.organizationId, {
      name: slots.name ?? `Campanha ${new Date().toISOString().slice(0, 16)}`,
      templateId: slots.templateId,
      accountIds: [number.whatsappAccountId],
      phoneNumberIds: [slots.senderId],
      scheduledAt: slots.scheduledAt ?? undefined,
    });
    return { backendCampaignId: campaign.id };
  }

  async startCampaign(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<{ started: boolean; status: string }> {
    // O usuário já revisou a prévia e aprovou; avisos do preflight foram
    // reconhecidos. BLOCKED continua impedindo o início (spec §24).
    const { campaign } = await this.campaigns.start(
      this.auth(ctx),
      ctx.organizationId,
      backendCampaignId,
      true,
    );
    return { started: campaign.status === 'RUNNING' || campaign.status === 'SCHEDULED', status: campaign.status };
  }

  async pauseCampaign(ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }> {
    const c = await this.campaigns.pause(this.auth(ctx), ctx.organizationId, backendCampaignId);
    return { status: c.status };
  }

  async cancelCampaign(ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }> {
    const c = await this.campaigns.cancel(this.auth(ctx), ctx.organizationId, backendCampaignId);
    return { status: c.status };
  }

  async getCampaignStatus(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<CampaignStatusData> {
    return this.aggregate(ctx, backendCampaignId);
  }

  async getCampaignReport(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<CampaignReportData> {
    const base = await this.aggregate(ctx, backendCampaignId);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: backendCampaignId, organizationId: ctx.organizationId },
      include: { template: { select: { name: true } } },
    });
    // Motivo de falha mais comum (spec §17).
    const errors = await this.prisma.message.groupBy({
      by: ['errorCode'],
      where: { organizationId: ctx.organizationId, campaignId: backendCampaignId, status: 'FAILED' },
      _count: { _all: true },
    });
    const topError = errors
      .filter((e) => e.errorCode)
      .sort((a, b) => b._count._all - a._count._all)[0];
    return {
      ...base,
      templateName: campaign?.template.name,
      startedAt: campaign?.startedAt?.toISOString(),
      completedAt: campaign?.completedAt?.toISOString(),
      deliveryRate: base.total > 0 ? base.delivered / base.total : 0,
      topErrorReason: topError?.errorCode ?? undefined,
    };
  }

  private async aggregate(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<CampaignStatusData> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: backendCampaignId, organizationId: ctx.organizationId },
      select: { status: true },
    });
    if (!campaign) throw new Error('Campanha não encontrada.');

    const groups = await this.prisma.message.groupBy({
      by: ['status'],
      where: { organizationId: ctx.organizationId, campaignId: backendCampaignId },
      _count: { _all: true },
    });
    const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    const delivered = count('DELIVERED') + count('READ');
    const failed = count('FAILED');
    const pending = count('QUEUED') + count('PROCESSING') + count('ACCEPTED') + count('SENT');
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    const processed = total - count('QUEUED');
    return {
      campaignId: backendCampaignId,
      status: campaign.status,
      total,
      processed,
      delivered,
      pending,
      failed,
    };
  }

  // Recarga automática por API não está disponível nesta infraestrutura
  // (spec §12) — o assistente orienta a recarga pelo painel/financeiro.
  prepareRecharge(_ctx: AssistantContext, amount: number): Promise<RechargePreparation> {
    return Promise.resolve({
      amount,
      currency: 'BRL',
      accountLabel: '',
      paymentMethodLabel: '',
      supported: false,
    });
  }

  executeRecharge(): Promise<{ confirmed: boolean; newBalance: number | null }> {
    return Promise.reject(new Error('Recarga automática por API não está disponível.'));
  }

  async audit(ctx: AssistantContext, entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? undefined) as object | undefined,
      },
    });
  }
}

/**
 * AssistantContext do pacote + o AuthContext do backend anexado, para reusar os
 * serviços (que exigem AuthContext) sem afrouxar as permissões (spec §19).
 */
export interface ApiAssistantContext extends AssistantContext {
  auth: AuthContext;
}

/** Constrói um AssistantContext a partir do AuthContext do backend (spec §19). */
export function buildAssistantContext(
  auth: AuthContext,
  organizationId: string,
): ApiAssistantContext {
  return {
    userId: auth.userId,
    organizationId,
    hasPermission: (permission) => can(auth, organizationId, permission),
    auth,
  };
}

function lastFour(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `final ${digits.slice(-4)}` : undefined;
}

/** Extrai o texto do BODY e as variáveis {{n}} dos componentes do template. */
function parseComponents(components: unknown): { body?: string; variables: string[] } {
  if (!Array.isArray(components)) return { variables: [] };
  const body = components.find(
    (c): c is { type: string; text?: string } =>
      typeof c === 'object' && c !== null && (c as { type?: string }).type === 'BODY',
  );
  const text = body?.text;
  if (!text) return { variables: [] };
  const variables = [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!);
  return { body: text, variables: [...new Set(variables)] };
}
