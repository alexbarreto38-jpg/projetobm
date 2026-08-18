import type { AssistantBackend, AssistantContext } from './backend.js';
import { dispatchTool, type DispatchOutput } from './dispatcher.js';
import { zodToJsonSchema } from './jsonschema.js';
import type {
  LlmClient,
  LlmMessage,
  LlmToolDef,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from './llm.js';
import { DEFAULT_SAFETY_POLICY, type SafetyPolicy } from './policy.js';
import type { CampaignDraft } from './session.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { TOOLS, type ToolExecContext } from './tools.js';

/** Ferramentas no formato do LLM, derivadas uma única vez do registro Zod. */
export const LLM_TOOLS: LlmToolDef[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: zodToJsonSchema(t.inputSchema),
}));

export interface AssistantTurnInput {
  ctx: AssistantContext;
  backend: AssistantBackend;
  llm: LlmClient;
  /** Rascunho atual da conversa (persistido pelo backend entre turnos — spec §5). */
  draft: CampaignDraft | null;
  /** Histórico de mensagens da conversa (persistido entre turnos). */
  history: LlmMessage[];
  /** Texto do usuário — já transcrito, se veio de áudio (spec §3). */
  userText: string;
  policy?: SafetyPolicy;
  allocateCampaignId: () => Promise<string>;
  now?: () => Date;
  /** Trava contra laços de ferramentas (spec §23). */
  maxIterations?: number;
}

export interface AssistantTurnOutput {
  /** Texto a enviar ao usuário pelo WhatsApp. */
  reply: string;
  draft: CampaignDraft | null;
  history: LlmMessage[];
  toolTrace: DispatchOutput[];
}

/**
 * Executa um turno da conversa: injeta a mensagem do usuário, roda o laço de
 * tool-use do LLM através do dispatcher (que aplica os guardrails) e devolve a
 * resposta em texto + o rascunho atualizado (spec §2, §25).
 *
 * O system prompt é reconstruído a cada iteração porque o estado do rascunho
 * (fonte de verdade) muda conforme as ferramentas executam.
 */
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnOutput> {
  const now = input.now ?? (() => new Date());
  const policy = input.policy ?? DEFAULT_SAFETY_POLICY;
  const maxIterations = input.maxIterations ?? 8;

  let draft = input.draft;
  const history: LlmMessage[] = [
    ...input.history,
    { role: 'user', content: [{ type: 'text', text: input.userText }] },
  ];
  const toolTrace: DispatchOutput[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await input.llm.complete({
      system: buildSystemPrompt(draft),
      messages: history,
      tools: LLM_TOOLS,
    });

    const assistantBlocks = response.content;
    history.push({ role: 'assistant', content: assistantBlocks });

    const toolUses = assistantBlocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0 || response.stopReason !== 'tool_use') {
      return { reply: collectText(assistantBlocks), draft, history, toolTrace };
    }

    // Executa as ferramentas sequencialmente, encadeando o rascunho.
    const toolResults: ToolResultBlock[] = [];
    for (const call of toolUses) {
      const exec: ToolExecContext = {
        ctx: input.ctx,
        backend: input.backend,
        draft,
        policy,
        now,
        allocateCampaignId: input.allocateCampaignId,
      };
      const out = await dispatchTool(exec, call.name, call.input);
      toolTrace.push(out);
      if (out.draft !== undefined) draft = out.draft;
      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(out.result),
        is_error: !out.result.ok,
      });
    }
    history.push({ role: 'user', content: toolResults });
  }

  // Excedeu o limite de iterações: não inventa resultado (spec §24).
  return {
    reply:
      'Precisei de muitos passos para concluir e parei por segurança. Pode reformular ou confirmar o próximo passo?',
    draft,
    history,
    toolTrace,
  };
}

function collectText(blocks: (TextBlock | ToolUseBlock)[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
