import type { Permission } from '@wise/types';
import type { CampaignSlots } from './session.js';

/**
 * Contexto de execução do assistente. Carrega quem está falando e o que ele
 * pode fazer, desacoplado do @wise/auth para manter o "cérebro" sem dependência
 * de infraestrutura. O adaptador na API constrói isto a partir do AuthContext
 * (spec §19).
 */
export interface AssistantContext {
  userId: string;
  organizationId: string;
  hasPermission: (permission: Permission) => boolean;
}

// --- Formatos de dados retornados pelas capacidades do backend (spec §26) ----

export interface Sender {
  id: string;
  label: string; // ex.: "Empresa X"
  phone: string; // E.164
  displayNumber?: string; // ex.: "final 4587"
  paused: boolean;
}

export interface TemplateInfo {
  id: string;
  name: string;
  status: string; // APPROVED, PENDING, REJECTED...
  category: string; // UTILITY, MARKETING, AUTHENTICATION
  language: string; // pt_BR...
  /** Variáveis posicionais do corpo: ["1", "2", ...] (spec §10). */
  variables: string[];
  bodyText?: string;
  /** Contas/remetentes em que o template está aprovado (spec §9). */
  approvedSenderIds?: string[];
}

export interface ListValidationResult {
  listRef: string;
  total: number;
  valid: number;
  invalid: number;
  duplicated: number;
  missingRequired: number;
  /** Colunas detectadas para mapear variáveis (spec §10). */
  columns: string[];
  sampleRow?: Record<string, string>;
}

export interface BalanceInfo {
  /** Nem toda infraestrutura expõe saldo (spec §11). `available:null` = N/D. */
  available: number | null;
  currency: string;
  supported: boolean;
}

export interface CostEstimate {
  count: number;
  unitCost: number | null;
  totalCost: number | null;
  currency: string;
  supported: boolean;
}

export interface CampaignPreviewData {
  campaignId: string;
  senderLabel: string;
  audienceTotal: number;
  audienceValid: number;
  templateName: string;
  templateCategory: string;
  templateLanguage: string;
  variableMapping: Record<string, string>;
  schedule: string; // "envio imediato" | ISO
  estimatedCount: number;
  estimatedCost: number | null;
  balance: number | null;
  currency: string;
  /** Mensagem renderizada com um contato de exemplo (spec §13). */
  sampleMessage: string;
}

export interface CampaignStatusData {
  campaignId: string;
  status: string;
  total: number;
  processed: number;
  delivered: number;
  pending: number;
  failed: number;
}

export interface CampaignReportData extends CampaignStatusData {
  senderLabel?: string;
  templateName?: string;
  startedAt?: string;
  completedAt?: string;
  deliveryRate: number; // 0..1
  invalidContacts?: number;
  cost?: number | null;
  topErrorReason?: string;
}

export interface RechargePreparation {
  amount: number;
  currency: string;
  accountLabel: string;
  paymentMethodLabel: string; // ex.: "cartão final 1234" (nunca o número completo — spec §12)
  supported: boolean;
}

/**
 * Capacidades reais que o backend expõe ao assistente (spec §26). Os nomes das
 * ferramentas conversacionais mapeiam para estes métodos. Quando uma capacidade
 * não existe na infraestrutura (ex.: saldo/recarga por API), o método deve
 * retornar `supported:false` em vez de inventar um valor (spec §11, §24).
 *
 * TODAS as operações recebem o AssistantContext e DEVEM reforçar permissões e
 * isolamento por organização no próprio backend — nunca confiar no modelo.
 */
export interface AssistantBackend {
  listSenders(ctx: AssistantContext): Promise<Sender[]>;
  /** Resolve um remetente por descrição natural (ex.: "final 4587") — spec §8. */
  resolveSender(ctx: AssistantContext, query: string): Promise<Sender[]>;

  listTemplates(ctx: AssistantContext): Promise<TemplateInfo[]>;
  getTemplate(ctx: AssistantContext, nameOrId: string): Promise<TemplateInfo | null>;

  /** Valida uma lista já recebida/importada (spec §7). */
  validateContactList(ctx: AssistantContext, listRef: string): Promise<ListValidationResult>;

  getBalance(ctx: AssistantContext): Promise<BalanceInfo>;
  estimateCost(ctx: AssistantContext, count: number, templateId: string): Promise<CostEstimate>;

  /** Cria a campanha real no backend e devolve seu id (spec §15). Idempotente. */
  createCampaign(
    ctx: AssistantContext,
    draftId: string,
    slots: CampaignSlots,
  ): Promise<{ backendCampaignId: string }>;

  /** Inicia o disparo. Só o backend confirma que começou (spec §24). */
  startCampaign(
    ctx: AssistantContext,
    backendCampaignId: string,
    idempotencyKey: string,
  ): Promise<{ started: boolean; status: string }>;

  pauseCampaign(ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }>;
  cancelCampaign(ctx: AssistantContext, backendCampaignId: string): Promise<{ status: string }>;

  getCampaignStatus(ctx: AssistantContext, backendCampaignId: string): Promise<CampaignStatusData>;
  getCampaignReport(ctx: AssistantContext, backendCampaignId: string): Promise<CampaignReportData>;

  /** Recarga: preparar (spec §12). A execução é separada e sensível. */
  prepareRecharge(ctx: AssistantContext, amount: number): Promise<RechargePreparation>;
  executeRecharge(
    ctx: AssistantContext,
    amount: number,
    idempotencyKey: string,
  ): Promise<{ confirmed: boolean; newBalance: number | null }>;

  /** Trilha de auditoria de ações sensíveis (spec §21, §33). */
  audit(ctx: AssistantContext, entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}
