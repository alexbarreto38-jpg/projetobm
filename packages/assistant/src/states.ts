/**
 * Máquina de estados da sessão de campanha (spec §14).
 *
 *   RASCUNHO → PREPARADO → AGUARDANDO_APROVAÇÃO → APROVADO → EXECUTANDO → FINALIZADO
 *
 * A trava central do produto: só se sai de `AWAITING_APPROVAL` para `APPROVED`
 * por confirmação explícita de um usuário autorizado (spec §14, §24). E toda
 * mudança de configuração após o preparo invalida a aprovação — a sessão volta
 * para `DRAFT` (ver `session.ts`), impedindo que um "OK" antigo autorize um
 * envio diferente do que foi revisado.
 */
export const DRAFT_STATES = [
  'DRAFT', //             RASCUNHO — coletando informações
  'PREPARED', //          PREPARADO — tudo validado, prévia calculável
  'AWAITING_APPROVAL', // AGUARDANDO_APROVAÇÃO — prévia apresentada
  'APPROVED', //          APROVADO — confirmação explícita registrada
  'EXECUTING', //         EXECUTANDO — disparo iniciado no backend
  'COMPLETED', //         FINALIZADO
  'CANCELLED', //         cancelado antes ou durante
] as const;

export type DraftState = (typeof DRAFT_STATES)[number];

/** Rótulos em português para uso conversacional (spec §3). */
export const DRAFT_STATE_LABELS: Record<DraftState, string> = {
  DRAFT: 'Rascunho',
  PREPARED: 'Preparado',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  EXECUTING: 'Executando',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

/**
 * Transições permitidas. Qualquer transição fora deste mapa é um erro de
 * programação/fluxo e deve ser rejeitada — nunca "pulada" silenciosamente.
 */
export const ALLOWED_TRANSITIONS: Record<DraftState, readonly DraftState[]> = {
  DRAFT: ['PREPARED', 'CANCELLED'],
  // Voltar a DRAFT permite ajustar a configuração antes de pedir aprovação.
  PREPARED: ['AWAITING_APPROVAL', 'DRAFT', 'CANCELLED'],
  // Editar após a prévia invalida a aprovação pendente e reabre o rascunho.
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: DraftState, to: DraftState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: DraftState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}
