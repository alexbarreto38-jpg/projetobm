'use server';

import { api } from '@/lib/api';

export interface AssistantTurn {
  reply: string;
  state: string | null;
  campaignId: string | null;
}

/**
 * Envia uma mensagem ao assistente pelo BFF (spec §2). O token de sessão fica no
 * servidor; o navegador nunca fala direto com a API (spec §8, §46).
 */
export async function sendAssistantMessage(
  orgId: string,
  text: string,
): Promise<AssistantTurn & { error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { reply: '', state: null, campaignId: null, error: 'Mensagem vazia.' };

  const res = await api<AssistantTurn>(`/api/organizations/${orgId}/assistant/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: trimmed }),
  });
  if (!res.ok) {
    const error =
      res.status === 404
        ? 'O assistente não está habilitado nesta instância (configure ANTHROPIC_API_KEY).'
        : (res.error ?? 'Falha ao falar com o assistente.');
    return { reply: '', state: null, campaignId: null, error };
  }
  return res.data!;
}

/** Reinicia a conversa/rascunho do usuário (spec §5). */
export async function resetAssistant(orgId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/assistant/reset`, { method: 'POST' });
}
