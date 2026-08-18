import type { Permission } from '@wise/types';
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
} from '../backend.js';
import type { CampaignSlots } from '../session.js';

/** Backend em memória para testes — determinístico e observável. */
export class FakeBackend implements AssistantBackend {
  senders: Sender[] = [
    { id: 'snd_1', label: 'Empresa X', phone: '+5511999994587', displayNumber: 'final 4587', paused: false },
    { id: 'snd_2', label: 'Empresa Y', phone: '+5511888881234', displayNumber: 'final 1234', paused: true },
  ];
  templates: TemplateInfo[] = [
    {
      id: 'tpl_1',
      name: 'confirmacao_pagamento',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'pt_BR',
      variables: ['1', '2'],
      bodyText: 'Olá {{1}}, seu atendimento está confirmado para {{2}}.',
      approvedSenderIds: ['snd_1'],
    },
    {
      id: 'tpl_2',
      name: 'promo_agosto',
      status: 'PENDING',
      category: 'MARKETING',
      language: 'pt_BR',
      variables: ['1'],
      bodyText: 'Oi {{1}}, temos novidades!',
      approvedSenderIds: [],
    },
  ];
  balance: BalanceInfo = { available: 100, currency: 'BRL', supported: true };
  unitCost = 0.05;
  lists: Record<string, ListValidationResult> = {
    'import_1': {
      listRef: 'import_1',
      total: 2137,
      valid: 2041,
      invalid: 35,
      duplicated: 61,
      missingRequired: 0,
      columns: ['nome', 'telefone', 'data_atendimento'],
      sampleRow: { nome: 'Maria', telefone: '+5511977776666', data_atendimento: '20/08' },
    },
  };

  audits: AuditEntry[] = [];
  started: string[] = [];
  recharges: { amount: number; reference: string }[] = [];
  rechargeSupported = true;
  pauseCampaignAvailable = true;

  listSenders(): Promise<Sender[]> {
    return Promise.resolve(this.senders);
  }
  resolveSender(_ctx: AssistantContext, query: string): Promise<Sender[]> {
    const q = query.toLowerCase();
    return Promise.resolve(
      this.senders.filter(
        (s) => s.label.toLowerCase().includes(q) || (s.displayNumber ?? '').includes(q) || s.phone.includes(q),
      ),
    );
  }
  listTemplates(): Promise<TemplateInfo[]> {
    return Promise.resolve(this.templates);
  }
  getTemplate(_ctx: AssistantContext, nameOrId: string): Promise<TemplateInfo | null> {
    return Promise.resolve(this.templates.find((t) => t.id === nameOrId || t.name === nameOrId) ?? null);
  }
  validateContactList(_ctx: AssistantContext, listRef: string): Promise<ListValidationResult> {
    const v = this.lists[listRef];
    if (!v) return Promise.reject(new Error('lista não encontrada'));
    return Promise.resolve(v);
  }
  getBalance(): Promise<BalanceInfo> {
    return Promise.resolve(this.balance);
  }
  estimateCost(_ctx: AssistantContext, count: number): Promise<CostEstimate> {
    return Promise.resolve({
      count,
      unitCost: this.unitCost,
      totalCost: Number((count * this.unitCost).toFixed(2)),
      currency: 'BRL',
      supported: true,
    });
  }
  createCampaign(_ctx: AssistantContext, draftId: string): Promise<{ backendCampaignId: string }> {
    return Promise.resolve({ backendCampaignId: `bk_${draftId}` });
  }
  startCampaign(
    _ctx: AssistantContext,
    backendCampaignId: string,
  ): Promise<{ started: boolean; status: string }> {
    this.started.push(backendCampaignId);
    return Promise.resolve({ started: true, status: 'RUNNING' });
  }
  pauseCampaign(): Promise<{ status: string }> {
    if (!this.pauseCampaignAvailable) return Promise.reject(new Error('pausa indisponível'));
    return Promise.resolve({ status: 'PAUSED' });
  }
  cancelCampaign(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'CANCELLED' });
  }
  getCampaignStatus(_ctx: AssistantContext, backendCampaignId: string): Promise<CampaignStatusData> {
    return Promise.resolve({
      campaignId: backendCampaignId,
      status: 'RUNNING',
      total: 2041,
      processed: 1487,
      delivered: 1362,
      pending: 103,
      failed: 22,
    });
  }
  getCampaignReport(_ctx: AssistantContext, backendCampaignId: string): Promise<CampaignReportData> {
    return Promise.resolve({
      campaignId: backendCampaignId,
      status: 'COMPLETED',
      total: 2041,
      processed: 2041,
      delivered: 1962,
      pending: 25,
      failed: 54,
      deliveryRate: 0.961,
      topErrorReason: 'números inválidos',
    });
  }
  prepareRecharge(_ctx: AssistantContext, amount: number): Promise<RechargePreparation> {
    return Promise.resolve({
      amount,
      currency: 'BRL',
      accountLabel: 'Empresa X',
      paymentMethodLabel: 'cartão final 1234',
      supported: this.rechargeSupported,
    });
  }
  executeRecharge(
    _ctx: AssistantContext,
    amount: number,
    reference: string,
  ): Promise<{ confirmed: boolean; newBalance: number | null }> {
    // Idempotência: mesma referência não recarrega duas vezes.
    if (!this.recharges.some((r) => r.reference === reference)) {
      this.recharges.push({ amount, reference });
      this.balance = { ...this.balance, available: (this.balance.available ?? 0) + amount };
    }
    return Promise.resolve({ confirmed: true, newBalance: this.balance.available });
  }
  audit(_ctx: AssistantContext, entry: AuditEntry): Promise<void> {
    this.audits.push(entry);
    return Promise.resolve();
  }
}

/** Constrói um AssistantContext com um conjunto de permissões concedidas. */
export function fakeContext(
  granted: Permission[],
  overrides: Partial<AssistantContext> = {},
): AssistantContext {
  const set = new Set(granted);
  return {
    userId: 'user_1',
    organizationId: 'org_1',
    hasPermission: (p) => set.has(p),
    ...overrides,
  };
}

const ALL_PERMISSIONS: Permission[] = [
  'org:manage',
  'saas:manage',
  'connection:read',
  'connection:manage',
  'account:read',
  'account:sync',
  'template:read',
  'template:write',
  'contact:read',
  'contact:write',
  'campaign:read',
  'campaign:write',
  'campaign:execute',
  'report:read',
  'audit:read',
];

export function adminContext(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return fakeContext(ALL_PERMISSIONS, overrides);
}

/** Slots completos e válidos, prontos para a prévia (atalho de teste). */
export function completeSlots(): CampaignSlots {
  return {
    name: 'Clientes Agosto',
    senderId: 'snd_1',
    senderLabel: 'Empresa X / final 4587',
    templateId: 'tpl_1',
    templateName: 'confirmacao_pagamento',
    templateCategory: 'UTILITY',
    templateLanguage: 'pt_BR',
    templateBody: 'Olá {{1}}, seu atendimento está confirmado para {{2}}.',
    listRef: 'import_1',
    audienceTotal: 2137,
    audienceValid: 2041,
    variableMapping: { '1': 'nome', '2': 'data_atendimento' },
    sampleRow: { nome: 'Maria', data_atendimento: '20/08' },
    scheduledAt: null,
  };
}
