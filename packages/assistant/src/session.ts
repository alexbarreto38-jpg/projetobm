import { createHash } from 'node:crypto';
import {
  canTransition,
  type DraftState,
} from './states.js';

/**
 * Slots da campanha (spec §5). O backend — não a "memória" do modelo — mantém o
 * estado real da operação. Cada campo é preenchido conforme o usuário informa e
 * as ferramentas confirmam; nada aqui é "chutado" pela IA (spec §8, §24).
 */
export interface CampaignSlots {
  name?: string;
  senderId?: string;
  senderLabel?: string; // ex.: "Empresa X / número final 4587" (spec §8)
  templateId?: string;
  templateName?: string;
  templateCategory?: string;
  templateLanguage?: string;
  /** Referência da lista importada (id do ContactImport) — spec §6, §7. */
  listRef?: string;
  audienceTotal?: number; // registros recebidos
  audienceValid?: number; // aptos ao envio
  audienceInvalid?: number;
  audienceDuplicated?: number;
  /** Mapeamento variável do template → coluna da lista (spec §10). */
  variableMapping?: Record<string, string>;
  scheduledAt?: string | null; // ISO; null/omitido = envio imediato
  estimatedCount?: number;
  estimatedCost?: number;
  balance?: number;
  currency?: string;
  /** Corpo do template e uma linha de exemplo, para renderizar a prévia (§13). */
  templateBody?: string;
  sampleRow?: Record<string, string>;
}

/**
 * Registro de aprovação (spec §14, §24). A confirmação fica atrelada ao HASH da
 * configuração aprovada. Se qualquer slot relevante mudar depois, o hash não
 * confere mais e a aprovação deixa de valer — evita que um "pode enviar" de
 * antes autorize um envio diferente do revisado.
 */
export interface ApprovalRecord {
  configHash: string;
  approvedByUserId: string;
  approvedAt: string;
  /** Frase exata do usuário que autorizou (spec §14, §21). */
  utterance: string;
  /** Segunda aprovação, quando a política de limites exigiu (spec §20). */
  secondApprovalByUserId?: string;
}

export interface CampaignDraft {
  id: string; // CAMP-2026-000123 (spec §23)
  organizationId: string;
  requestedByUserId: string;
  state: DraftState;
  slots: CampaignSlots;
  approval?: ApprovalRecord;
  /** id da campanha real criada no backend quando o disparo inicia (spec §15). */
  backendCampaignId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Slots que compõem a "configuração aprovável". Só estes entram no hash de
 * aprovação: mudar o remetente, o template, a lista, o público, o mapeamento ou
 * o horário invalida a aprovação; mudar um rótulo cosmético não.
 */
const APPROVAL_RELEVANT_KEYS = [
  'senderId',
  'templateId',
  'listRef',
  'audienceValid',
  'variableMapping',
  'scheduledAt',
  'estimatedCount',
  'estimatedCost',
] as const;

/** Hash estável (ordem-independente) da configuração aprovável (spec §24). */
export function computeConfigHash(slots: CampaignSlots): string {
  const subset: Record<string, unknown> = {};
  for (const key of APPROVAL_RELEVANT_KEYS) {
    subset[key] = normalizeForHash(slots[key]);
  }
  return createHash('sha256').update(stableStringify(subset)).digest('hex');
}

function normalizeForHash(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = (value as Record<string, unknown>)[key];
    }
    return out;
  }
  return value ?? null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

/**
 * Slots mínimos para gerar a prévia e preparar a campanha (spec §4, §13). A
 * quantidade válida vem da validação da lista; sem ela não há o que revisar.
 */
export const REQUIRED_FOR_PREVIEW: (keyof CampaignSlots)[] = [
  'senderId',
  'templateId',
  'listRef',
  'audienceValid',
];

export function missingSlots(slots: CampaignSlots): (keyof CampaignSlots)[] {
  return REQUIRED_FOR_PREVIEW.filter((key) => slots[key] === undefined || slots[key] === null);
}

export function isReadyForPreview(slots: CampaignSlots): boolean {
  return missingSlots(slots).length === 0;
}

export class DraftStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftStateError';
  }
}

/**
 * Aplica uma transição de estado validando-a contra a máquina (spec §14).
 * Retorna um NOVO objeto (imutável) — nunca muta o recebido.
 */
export function transition(draft: CampaignDraft, to: DraftState, now = new Date()): CampaignDraft {
  if (draft.state === to) return draft;
  if (!canTransition(draft.state, to)) {
    throw new DraftStateError(
      `Transição inválida: ${draft.state} → ${to} (campanha ${draft.id}).`,
    );
  }
  return { ...draft, state: to, updatedAt: now.toISOString() };
}

/**
 * Atualiza slots. Se a sessão já passou de DRAFT e um slot RELEVANTE mudou, a
 * aprovação é descartada e a sessão volta a DRAFT (spec §14) — o usuário terá
 * que revisar a nova prévia e reaprovar.
 */
export function patchSlots(
  draft: CampaignDraft,
  patch: Partial<CampaignSlots>,
  now = new Date(),
): CampaignDraft {
  const nextSlots: CampaignSlots = { ...draft.slots, ...patch };
  const wasApprovable = draft.state !== 'DRAFT' && draft.state !== 'CANCELLED';
  const hashChanged =
    wasApprovable && computeConfigHash(draft.slots) !== computeConfigHash(nextSlots);

  const next: CampaignDraft = {
    ...draft,
    slots: nextSlots,
    updatedAt: now.toISOString(),
  };

  if (draft.state === 'EXECUTING' || draft.state === 'COMPLETED') {
    // Já em execução: os slots aprovados são imutáveis. Rejeitamos a alteração
    // em vez de silenciosamente reabrir (spec §24 — não inventar/alterar).
    throw new DraftStateError(
      `Campanha ${draft.id} está em ${draft.state}; a configuração não pode mais ser alterada.`,
    );
  }

  if (hashChanged) {
    next.state = 'DRAFT';
    delete next.approval;
  }
  return next;
}

/**
 * A aprovação registrada ainda vale para os slots atuais? (spec §24). Usado
 * como pré-condição da ferramenta `start_campaign`.
 */
export function approvalIsValid(draft: CampaignDraft): boolean {
  if (!draft.approval) return false;
  return draft.approval.configHash === computeConfigHash(draft.slots);
}

export function newDraft(params: {
  id: string;
  organizationId: string;
  requestedByUserId: string;
  slots?: CampaignSlots;
  now?: Date;
}): CampaignDraft {
  const iso = (params.now ?? new Date()).toISOString();
  return {
    id: params.id,
    organizationId: params.organizationId,
    requestedByUserId: params.requestedByUserId,
    state: 'DRAFT',
    slots: params.slots ?? {},
    createdAt: iso,
    updatedAt: iso,
  };
}
