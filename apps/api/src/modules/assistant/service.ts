import {
  formatCampaignId,
  runAssistantTurn,
  type LlmClient,
  type SafetyPolicy,
} from '@wise/assistant';
import { assertOrganizationAccess, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { PrismaAssistantBackend, buildAssistantContext } from './backend.js';
import {
  conversationKey,
  InMemorySessionStore,
  type AssistantSessionStore,
} from './session-store.js';

export interface AssistantServiceDeps {
  prisma: PrismaClient;
  llm: LlmClient;
  store?: AssistantSessionStore;
  policy?: SafetyPolicy;
}

export interface AssistantReply {
  reply: string;
  campaignId: string | null;
  state: string | null;
}

/**
 * Orquestra um turno de conversa do assistente (spec §2, §25): recupera o
 * estado da conversa, executa o laço de tool-use e persiste o novo estado. O
 * canal (WhatsApp/painel) só precisa passar o texto do usuário já transcrito
 * (spec §3).
 */
export class AssistantService {
  private readonly backend: PrismaAssistantBackend;
  private readonly store: AssistantSessionStore;

  constructor(private readonly deps: AssistantServiceDeps) {
    this.backend = new PrismaAssistantBackend(deps.prisma);
    this.store = deps.store ?? new InMemorySessionStore();
  }

  async handleMessage(
    auth: AuthContext,
    organizationId: string,
    userText: string,
  ): Promise<AssistantReply> {
    assertOrganizationAccess(auth, organizationId);
    const key = conversationKey(organizationId, auth.userId);
    const state = await this.store.get(key);
    const ctx = buildAssistantContext(auth, organizationId);

    const result = await runAssistantTurn({
      ctx,
      backend: this.backend,
      llm: this.deps.llm,
      draft: state.draft,
      history: state.history,
      userText,
      policy: this.deps.policy,
      allocateCampaignId: () => this.allocateCampaignId(organizationId),
    });

    await this.store.set(key, { draft: result.draft, history: result.history });
    return {
      reply: result.reply,
      campaignId: result.draft?.id ?? null,
      state: result.draft?.state ?? null,
    };
  }

  async reset(organizationId: string, userId: string): Promise<void> {
    await this.store.reset(conversationKey(organizationId, userId));
  }

  /** Sequência humana de campanha por organização (spec §23). */
  private async allocateCampaignId(organizationId: string): Promise<string> {
    const count = await this.deps.prisma.campaign.count({ where: { organizationId } });
    return formatCampaignId(new Date().getFullYear(), count + 1);
  }
}
