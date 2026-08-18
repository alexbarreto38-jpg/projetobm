import type { CampaignSlots } from './session.js';

/**
 * Limites de segurança configuráveis por organização (spec §20). São a última
 * linha de defesa: mesmo com aprovação, um envio acima do limite exige uma
 * segunda aprovação, e um valor acima do teto financeiro é bloqueado.
 */
export interface SafetyPolicy {
  /** Acima disso, exige uma segunda aprovação (spec §20). */
  maxMessagesWithoutSecondApproval: number;
  /** Teto absoluto de mensagens por operação; acima disso, bloqueia. */
  hardMaxMessagesPerOperation: number;
  /** Teto financeiro por operação (moeda da conta). */
  maxCostPerOperation: number;
  /** Teto financeiro diário — informativo/consumido pelo backend. */
  maxDailyCost: number;
}

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  maxMessagesWithoutSecondApproval: 5000,
  hardMaxMessagesPerOperation: 200000,
  maxCostPerOperation: 1000,
  maxDailyCost: 5000,
};

export type PolicyDecision =
  | { verdict: 'ALLOW' }
  | { verdict: 'SECOND_APPROVAL_REQUIRED'; reason: string }
  | { verdict: 'BLOCKED'; reason: string };

/**
 * Avalia os slots de uma campanha contra a política. Não decide sozinha o
 * disparo — apenas informa o dispatcher se pode seguir, se precisa de segunda
 * aprovação, ou se está travado (spec §20).
 */
export function evaluatePolicy(slots: CampaignSlots, policy: SafetyPolicy): PolicyDecision {
  const count = slots.estimatedCount ?? slots.audienceValid ?? 0;
  const cost = slots.estimatedCost ?? 0;

  if (count > policy.hardMaxMessagesPerOperation) {
    return {
      verdict: 'BLOCKED',
      reason: `A operação (${count.toLocaleString('pt-BR')} mensagens) excede o teto de ${policy.hardMaxMessagesPerOperation.toLocaleString('pt-BR')} por envio. Divida em campanhas menores ou ajuste a política.`,
    };
  }
  if (cost > policy.maxCostPerOperation) {
    return {
      verdict: 'BLOCKED',
      reason: `O custo estimado (R$ ${cost.toFixed(2)}) excede o limite de R$ ${policy.maxCostPerOperation.toFixed(2)} por operação.`,
    };
  }
  if (count > policy.maxMessagesWithoutSecondApproval) {
    return {
      verdict: 'SECOND_APPROVAL_REQUIRED',
      reason: `Envios acima de ${policy.maxMessagesWithoutSecondApproval.toLocaleString('pt-BR')} mensagens exigem uma segunda aprovação de um administrador.`,
    };
  }
  return { verdict: 'ALLOW' };
}
