import type {
  AssistantBackend,
  AssistantContext,
  AuditEntry,
  BalanceInfo,
  CampaignReportData,
  CampaignSlots,
  CampaignStatusData,
  CostEstimate,
  ListValidationResult,
  RechargePreparation,
  Sender,
  TemplateInfo,
} from '@wise/assistant';
import { normalizePhone, type CountryCode } from '@wise/validation';
import type { InfobipClient } from './client.js';
import {
  mapInfobipStatus,
  type CampaignStore,
  type ContactListStore,
  type StoredCampaign,
  type StoredRecipient,
} from './store.js';
import type { InfobipDeliveryReport, InfobipOutboundTemplateMessage } from './types.js';

export interface InfobipSenderConfig {
  /** Id lógico usado pelo assistente (pode ser o próprio número). */
  id: string;
  /** Número do sender no formato aceito pelo Infobip (E.164 sem '+', ex.: 5511...). */
  number: string;
  label: string;
}

export interface InfobipBackendConfig {
  client: InfobipClient;
  senders: InfobipSenderConfig[];
  lists: ContactListStore;
  campaigns: CampaignStore;
  /** País padrão para normalizar telefones sem DDI (spec §7). */
  defaultCountry?: CountryCode;
  /** Preço por mensagem (opcional). Se ausente, a estimativa fica indisponível (§11). */
  pricePerMessage?: number;
  currency?: string;
  /** Tamanho do lote no envio (spec §15). O Infobip aceita arrays de mensagens. */
  batchSize?: number;
  /** Coluna de telefone na lista (padrão: detecta telefone/phone/msisdn). */
  phoneColumn?: string;
  audit?: (ctx: AssistantContext, entry: AuditEntry) => Promise<void> | void;
}

/**
 * Backend do assistente sobre o Infobip (spec §1, §26). Implementa a MESMA
 * interface `AssistantBackend` do cérebro (@wise/assistant): trocar Meta por
 * Infobip não muda o cérebro — só a fiação.
 *
 * Diferente da Meta, o Infobip **expõe saldo** (`getBalance`), então o §11 passa
 * a funcionar de verdade. Custo unitário e recarga por API continuam dependendo
 * de configuração/produto: reportados honestamente quando indisponíveis (§24).
 *
 * Este provider é single-account (escopo da configuração). O isolamento
 * multi-tenant e as permissões são aplicados antes, no dispatcher (§19).
 */
export class InfobipAssistantBackend implements AssistantBackend {
  private readonly cfg: Required<Pick<InfobipBackendConfig, 'defaultCountry' | 'batchSize' | 'currency'>> &
    InfobipBackendConfig;

  constructor(config: InfobipBackendConfig) {
    this.cfg = {
      defaultCountry: config.defaultCountry ?? 'BR',
      batchSize: config.batchSize ?? 50,
      currency: config.currency ?? 'BRL',
      ...config,
    };
  }

  // --- Remetentes (spec §8) -------------------------------------------------

  listSenders(_ctx: AssistantContext): Promise<Sender[]> {
    return Promise.resolve(
      this.cfg.senders.map((s) => ({
        id: s.id,
        label: s.label,
        phone: s.number.startsWith('+') ? s.number : `+${s.number}`,
        displayNumber: lastFour(s.number),
        paused: false,
      })),
    );
  }

  async resolveSender(ctx: AssistantContext, query: string): Promise<Sender[]> {
    const q = query.toLowerCase().replace(/\s+/g, '');
    const digits = q.replace(/\D/g, '');
    const senders = await this.listSenders(ctx);
    return senders.filter((s) => {
      const hay = `${s.label} ${s.phone} ${s.displayNumber ?? ''}`.toLowerCase().replace(/\s+/g, '');
      const phoneDigits = s.phone.replace(/\D/g, '');
      return hay.includes(q) || (digits.length >= 3 && phoneDigits.includes(digits));
    });
  }

  // --- Templates (spec §9, §10) --------------------------------------------

  async listTemplates(_ctx: AssistantContext): Promise<TemplateInfo[]> {
    return this.aggregateTemplates();
  }

  async getTemplate(_ctx: AssistantContext, nameOrId: string): Promise<TemplateInfo | null> {
    const all = await this.aggregateTemplates();
    return all.find((t) => t.id === nameOrId || t.name === nameOrId) ?? null;
  }

  /** Junta os templates de todos os senders, marcando onde estão aprovados. */
  private async aggregateTemplates(): Promise<TemplateInfo[]> {
    const byName = new Map<string, TemplateInfo>();
    for (const sender of this.cfg.senders) {
      let templates;
      try {
        templates = await this.cfg.client.listTemplates(sender.number);
      } catch {
        continue; // um sender sem templates não derruba os demais
      }
      for (const t of templates) {
        const key = `${t.name}::${t.language}`;
        const body = t.structure.body?.text;
        const variables = body
          ? [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!))]
          : [];
        const approved = t.status.toUpperCase() === 'APPROVED';
        const existing = byName.get(key);
        if (existing) {
          if (approved && !existing.approvedSenderIds?.includes(sender.id)) {
            existing.approvedSenderIds = [...(existing.approvedSenderIds ?? []), sender.id];
            existing.status = 'APPROVED';
          }
        } else {
          byName.set(key, {
            id: t.name,
            name: t.name,
            status: approved ? 'APPROVED' : t.status.toUpperCase(),
            category: t.category,
            language: t.language,
            variables,
            bodyText: body,
            approvedSenderIds: approved ? [sender.id] : [],
          });
        }
      }
    }
    return [...byName.values()];
  }

  // --- Lista (spec §6, §7) --------------------------------------------------

  async validateContactList(_ctx: AssistantContext, listRef: string): Promise<ListValidationResult> {
    const list = await this.cfg.lists.get(listRef);
    if (!list) throw new Error(`Lista "${listRef}" não encontrada.`);
    const phoneCol = this.resolvePhoneColumn(list.columns);

    let invalid = 0;
    let missingRequired = 0;
    let duplicated = 0;
    const seen = new Set<string>();
    let sampleRow: Record<string, string> | undefined;

    for (const row of list.rows) {
      const raw = phoneCol ? row[phoneCol] : undefined;
      if (!raw) {
        missingRequired++;
        continue;
      }
      const e164 = normalizePhone(raw, this.cfg.defaultCountry);
      if (!e164) {
        invalid++;
        continue;
      }
      if (seen.has(e164)) {
        duplicated++;
        continue;
      }
      seen.add(e164);
      if (!sampleRow) sampleRow = row;
    }

    return {
      listRef,
      total: list.rows.length,
      valid: seen.size,
      invalid,
      duplicated,
      missingRequired,
      columns: list.columns,
      sampleRow,
    };
  }

  // --- Saldo e custo (spec §11) --------------------------------------------

  async getBalance(_ctx: AssistantContext): Promise<BalanceInfo> {
    const balance = await this.cfg.client.getBalance();
    return { available: balance.balance, currency: balance.currency, supported: true };
  }

  estimateCost(_ctx: AssistantContext, count: number): Promise<CostEstimate> {
    if (this.cfg.pricePerMessage === undefined) {
      return Promise.resolve({ count, unitCost: null, totalCost: null, currency: this.cfg.currency, supported: false });
    }
    const unit = this.cfg.pricePerMessage;
    return Promise.resolve({
      count,
      unitCost: unit,
      totalCost: Number((count * unit).toFixed(2)),
      currency: this.cfg.currency,
      supported: true,
    });
  }

  // --- Campanha (spec §15, §16) --------------------------------------------

  async createCampaign(
    _ctx: AssistantContext,
    draftId: string,
    slots: CampaignSlots,
  ): Promise<{ backendCampaignId: string }> {
    const existing = await this.cfg.campaigns.get(draftId);
    if (existing) return { backendCampaignId: existing.id }; // idempotente (spec §19, §23)

    const sender = this.cfg.senders.find((s) => s.id === slots.senderId);
    if (!sender) throw new Error('Remetente não encontrado na configuração do Infobip.');
    const templateName = slots.templateName ?? slots.templateId;
    if (!templateName) throw new Error('Template não definido.');
    if (!slots.listRef) throw new Error('Lista não definida.');

    const list = await this.cfg.lists.get(slots.listRef);
    if (!list) throw new Error(`Lista "${slots.listRef}" não encontrada.`);
    const phoneCol = this.resolvePhoneColumn(list.columns);
    const mapping = slots.variableMapping ?? {};
    const orderedVars = Object.keys(mapping).sort((a, b) => Number(a) - Number(b));

    const recipients: StoredRecipient[] = [];
    const seen = new Set<string>();
    for (const row of list.rows) {
      const raw = phoneCol ? row[phoneCol] : undefined;
      const e164 = raw ? normalizePhone(raw, this.cfg.defaultCountry) : null;
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);
      recipients.push({
        phone: e164,
        messageId: `${draftId}::${e164}`,
        status: 'pending',
      });
    }

    const campaign: StoredCampaign = {
      id: draftId,
      sender: sender.number,
      templateName,
      language: slots.templateLanguage ?? 'pt_BR',
      listRef: slots.listRef,
      mapping,
      status: 'DRAFT',
      recipients,
      createdAt: new Date().toISOString(),
    };
    // Guardamos os placeholders por telefone para o envio (fora do tipo público).
    (campaign as StoredCampaign & { placeholders?: Record<string, string[]> }).placeholders =
      buildPlaceholders(list, phoneCol, orderedVars, mapping, this.cfg.defaultCountry);

    await this.cfg.campaigns.set(campaign);
    return { backendCampaignId: campaign.id };
  }

  async startCampaign(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<{ started: boolean; status: string }> {
    const campaign = await this.cfg.campaigns.get(backendCampaignId);
    if (!campaign) throw new Error('Campanha não encontrada.');
    if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
      return { started: true, status: campaign.status }; // idempotente
    }

    const placeholders =
      (campaign as StoredCampaign & { placeholders?: Record<string, string[]> }).placeholders ?? {};

    const messages: InfobipOutboundTemplateMessage[] = campaign.recipients.map((r) => ({
      from: campaign.sender,
      to: r.phone.replace(/^\+/, ''),
      messageId: r.messageId,
      content: {
        templateName: campaign.templateName,
        templateData: { body: { placeholders: placeholders[r.phone] ?? [] } },
        language: campaign.language,
      },
    }));

    // Envio em lotes (spec §15). O messageId garante idempotência (spec §54).
    for (const batch of chunk(messages, this.cfg.batchSize)) {
      const res = await this.cfg.client.sendTemplateMessages(batch);
      for (const sent of res.messages ?? []) {
        const recipient = campaign.recipients.find((r) => r.messageId === sent.messageId);
        if (recipient) recipient.status = mapInfobipStatus(sent.status.groupName);
      }
    }

    campaign.status = 'RUNNING';
    campaign.startedAt = new Date().toISOString();
    await this.cfg.campaigns.set(campaign);
    await this.runAudit(ctx, {
      action: 'INFOBIP_CAMPAIGN_STARTED',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: { recipients: campaign.recipients.length, sender: campaign.sender },
    });
    return { started: true, status: campaign.status };
  }

  async pauseCampaign(_ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }> {
    // Mensagens já entregues ao Infobip não podem ser "despausadas" de volta;
    // marcamos a intenção para não gerar novos lotes (spec §26 — quando permitido).
    const campaign = await this.cfg.campaigns.get(backendCampaignId);
    if (!campaign) throw new Error('Campanha não encontrada.');
    campaign.status = 'PAUSED';
    await this.cfg.campaigns.set(campaign);
    return { status: campaign.status };
  }

  async cancelCampaign(_ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }> {
    const campaign = await this.cfg.campaigns.get(backendCampaignId);
    if (!campaign) throw new Error('Campanha não encontrada.');
    campaign.status = 'CANCELLED';
    await this.cfg.campaigns.set(campaign);
    return { status: campaign.status };
  }

  async getCampaignStatus(
    _ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<CampaignStatusData> {
    const campaign = await this.cfg.campaigns.get(backendCampaignId);
    if (!campaign) throw new Error('Campanha não encontrada.');
    return this.aggregate(campaign);
  }

  async getCampaignReport(
    ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<CampaignReportData> {
    const campaign = await this.cfg.campaigns.get(backendCampaignId);
    if (!campaign) throw new Error('Campanha não encontrada.');
    const base = this.aggregate(campaign);

    const reasons = new Map<string, number>();
    for (const r of campaign.recipients) {
      if (r.status === 'failed' && r.errorReason) {
        reasons.set(r.errorReason, (reasons.get(r.errorReason) ?? 0) + 1);
      }
    }
    const topError = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const cost = await this.estimateCost(ctx, base.total);
    return {
      ...base,
      templateName: campaign.templateName,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      deliveryRate: base.total > 0 ? base.delivered / base.total : 0,
      topErrorReason: topError,
      cost: cost.totalCost,
    };
  }

  private aggregate(campaign: StoredCampaign): CampaignStatusData {
    const total = campaign.recipients.length;
    const delivered = campaign.recipients.filter((r) => r.status === 'delivered').length;
    const failed = campaign.recipients.filter((r) => r.status === 'failed').length;
    const pending = campaign.recipients.filter((r) => r.status === 'pending').length;
    return {
      campaignId: campaign.id,
      status: campaign.status,
      total,
      processed: total - pending,
      delivered,
      pending,
      failed,
    };
  }

  // --- Recarga (spec §12) — sem API pública de top-up no Infobip ------------

  prepareRecharge(_ctx: AssistantContext, amount: number): Promise<RechargePreparation> {
    return Promise.resolve({
      amount,
      currency: this.cfg.currency,
      accountLabel: '',
      paymentMethodLabel: '',
      supported: false,
    });
  }
  executeRecharge(): Promise<{ confirmed: boolean; newBalance: number | null }> {
    return Promise.reject(new Error('Recarga automática por API não está disponível no Infobip.'));
  }

  async audit(ctx: AssistantContext, entry: AuditEntry): Promise<void> {
    await this.runAudit(ctx, entry);
  }
  private async runAudit(ctx: AssistantContext, entry: AuditEntry): Promise<void> {
    if (this.cfg.audit) await this.cfg.audit(ctx, entry);
  }

  private resolvePhoneColumn(columns: string[]): string | undefined {
    if (this.cfg.phoneColumn && columns.includes(this.cfg.phoneColumn)) return this.cfg.phoneColumn;
    return columns.find((c) => /tel|phone|msisdn|celular|whats/i.test(c));
  }
}

/**
 * Ingestão de relatórios de entrega do Infobip (webhook) no CampaignStore
 * (spec §16, §31). Chame isto no handler do webhook de delivery reports.
 */
export async function ingestDeliveryReports(
  store: CampaignStore,
  reports: InfobipDeliveryReport[],
): Promise<void> {
  for (const report of reports) {
    const status = mapInfobipStatus(report.status.groupName);
    const reason = report.error?.description ?? report.error?.name;
    await store.applyReport(report.messageId, status, status === 'failed' ? reason : undefined);
  }
}

function buildPlaceholders(
  list: { rows: Record<string, string>[] },
  phoneCol: string | undefined,
  orderedVars: string[],
  mapping: Record<string, string>,
  country: CountryCode,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const row of list.rows) {
    const raw = phoneCol ? row[phoneCol] : undefined;
    const e164 = raw ? normalizePhone(raw, country) : null;
    if (!e164 || seen.has(e164)) continue;
    seen.add(e164);
    out[e164] = orderedVars.map((v) => row[mapping[v] ?? ''] ?? '');
  }
  return out;
}

function lastFour(number: string): string | undefined {
  const digits = number.replace(/\D/g, '');
  return digits.length >= 4 ? `final ${digits.slice(-4)}` : undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
