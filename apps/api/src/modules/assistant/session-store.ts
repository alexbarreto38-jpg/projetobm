import type { CampaignDraft, LlmMessage } from '@wise/assistant';

/**
 * Estado de uma conversa do assistente entre turnos (spec §5): o rascunho da
 * campanha (fonte de verdade da operação) + o histórico de mensagens.
 */
export interface ConversationState {
  draft: CampaignDraft | null;
  history: LlmMessage[];
}

export interface AssistantSessionStore {
  get(key: string): Promise<ConversationState>;
  set(key: string, state: ConversationState): Promise<void>;
  reset(key: string): Promise<void>;
}

/**
 * Store em memória — suficiente para uma instância única (MVP). Em produção com
 * múltiplas réplicas, troque por Redis/Postgres para que a conversa sobreviva a
 * reinícios e seja compartilhada entre instâncias.
 */
export class InMemorySessionStore implements AssistantSessionStore {
  private readonly map = new Map<string, ConversationState>();

  get(key: string): Promise<ConversationState> {
    return Promise.resolve(this.map.get(key) ?? { draft: null, history: [] });
  }
  set(key: string, state: ConversationState): Promise<void> {
    this.map.set(key, state);
    return Promise.resolve();
  }
  reset(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

/** Chave de conversa por (organização, usuário) — spec §19 (isolamento). */
export function conversationKey(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`;
}
