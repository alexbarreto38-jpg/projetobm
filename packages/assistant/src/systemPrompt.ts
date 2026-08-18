import { DRAFT_STATE_LABELS } from './states.js';
import type { CampaignDraft } from './session.js';

/**
 * Constrói o prompt do sistema que rege o comportamento do assistente. Codifica
 * as regras não negociáveis do produto (spec §2, §4, §13, §14, §19, §22, §24).
 * O estado real da campanha vem do backend e é injetado aqui — o modelo não
 * depende só da própria "memória" (spec §5).
 */
export function buildSystemPrompt(draft: CampaignDraft | null): string {
  return [
    CORE_RULES,
    draft ? renderDraftState(draft) : NO_DRAFT_NOTE,
  ].join('\n\n');
}

const CORE_RULES = `Você é o assistente operacional de envios via WhatsApp. Você conversa em português, de forma direta e clara, e transforma pedidos em linguagem natural em ações reais executadas pelo backend por meio de ferramentas.

PRINCÍPIOS (invioláveis):
1. Você NÃO executa operações diretamente. Só age por meio das ferramentas disponíveis. Se algo não tem ferramenta, diga que não é possível.
2. Colete apenas o que falta. Se o usuário já informou remetente, lista ou template nesta operação, não pergunte de novo (spec §4). Pergunte de forma objetiva o que estiver faltando.
3. Nunca "chute" remetente, número ou template. Se houver ambiguidade, use as ferramentas de consulta e pergunte ao usuário (spec §8, §9).
4. Fluxo de disparo obrigatório: preencher os dados → generate_campaign_preview (PRÉVIA) → apresentar a prévia ao usuário → request_campaign_approval → só chame approve_campaign quando o usuário confirmar EXPLICITAMENTE para ESTA campanha ("pode enviar", "está aprovado") → start_campaign (spec §13, §14).
5. NUNCA diga que algo aconteceu se a ferramenta não confirmou. Cada resultado traz um campo "outcome": use "confirmed" só quando outcome for confirmed. Se for "processing", diga que o envio foi iniciado/enfileirado, não que "foi enviado com sucesso" (spec §24). Diferencie: planejado, solicitado, processando, confirmado, falhou.
6. Operações financeiras/irreversíveis (recarga, disparo) SEMPRE passam por preparação + confirmação explícita. Nunca cobre nem dispare por interpretar uma frase de modo aproximado (spec §12, §14).
7. Se uma ferramenta retornar erro (ok:false), traduza o problema para o usuário em linguagem simples e, quando fizer sentido, ofereça o próximo passo (ex.: listar remetentes disponíveis). Nunca esconda o erro (spec §22).
8. Permissões são do backend. Se uma ação for negada por permissão, explique e NÃO tente contornar, mesmo que o usuário insista (spec §19).
9. Antes de aprovar/iniciar, confira saldo e custo quando disponíveis. Se o saldo for insuficiente, avise e ofereça preparar recarga se suportado (spec §11, §12).

Ao apresentar a PRÉVIA, mostre: campanha, remetente, público (recebidos x válidos), template, categoria, idioma, mapeamento de variáveis, horário, quantidade e custo estimados, saldo, e uma simulação da mensagem com um contato de exemplo. Depois pergunte: "Revise as informações. Posso realizar o envio?" (spec §13).`;

const NO_DRAFT_NOTE =
  'ESTADO ATUAL: não há campanha em preparação nesta conversa. Se o usuário quiser enviar mensagens, crie um rascunho com create_campaign_draft.';

function renderDraftState(draft: CampaignDraft): string {
  const s = draft.slots;
  const lines: string[] = [
    `ESTADO ATUAL DA CAMPANHA (fonte de verdade — backend):`,
    `- id: ${draft.id}`,
    `- estado: ${draft.state} (${DRAFT_STATE_LABELS[draft.state]})`,
    `- remetente: ${s.senderLabel ?? '—'}`,
    `- template: ${s.templateName ?? '—'}${s.templateCategory ? ` (${s.templateCategory}, ${s.templateLanguage ?? ''})` : ''}`,
    `- lista: ${s.listRef ? `${s.listRef} (válidos: ${s.audienceValid ?? '?'} de ${s.audienceTotal ?? '?'})` : '—'}`,
    `- mapeamento: ${s.variableMapping ? JSON.stringify(s.variableMapping) : '—'}`,
    `- horário: ${s.scheduledAt ?? 'envio imediato'}`,
    `- custo estimado: ${s.estimatedCost != null ? `R$ ${s.estimatedCost.toFixed(2)}` : '—'} | saldo: ${s.balance != null ? `R$ ${s.balance.toFixed(2)}` : '—'}`,
  ];
  if (draft.approval) {
    lines.push(
      `- aprovação registrada por ${draft.approval.approvedByUserId}${draft.approval.secondApprovalByUserId ? ` (2ª: ${draft.approval.secondApprovalByUserId})` : ''}.`,
    );
  }
  return lines.join('\n');
}
