import { describe, expect, it } from 'vitest';
import type { LlmClient, LlmRequest, LlmResponse } from '../llm.js';
import { LLM_TOOLS, runAssistantTurn } from '../orchestrator.js';
import { adminContext, FakeBackend } from './fakes.js';

/** LLM de teste: devolve respostas pré-roteirizadas em ordem e grava os pedidos. */
class ScriptedLlm implements LlmClient {
  requests: LlmRequest[] = [];
  constructor(private readonly script: LlmResponse[]) {}
  complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const next = this.script.shift();
    if (!next) throw new Error('ScriptedLlm sem respostas restantes');
    return Promise.resolve(next);
  }
}

function base(llm: LlmClient) {
  return {
    ctx: adminContext(),
    backend: new FakeBackend(),
    llm,
    draft: null,
    history: [],
    allocateCampaignId: () => Promise.resolve('CAMP-2026-000001'),
    now: () => new Date('2026-08-18T10:00:00Z'),
  };
}

describe('orquestrador (spec §2, §25)', () => {
  it('devolve o texto quando o modelo não usa ferramentas', async () => {
    const llm = new ScriptedLlm([
      { content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }], stopReason: 'end_turn' },
    ]);
    const out = await runAssistantTurn({ ...base(llm), userText: 'oi' });
    expect(out.reply).toBe('Olá! Como posso ajudar?');
    expect(out.toolTrace).toHaveLength(0);
    // O system prompt carrega as regras.
    expect(llm.requests[0]!.system).toContain('PRÉVIA');
  });

  it('executa a ferramenta pedida e encadeia o rascunho', async () => {
    const llm = new ScriptedLlm([
      {
        content: [{ type: 'tool_use', id: 't1', name: 'create_campaign_draft', input: { name: 'Agosto' } }],
        stopReason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Criei o rascunho CAMP-2026-000001.' }], stopReason: 'end_turn' },
    ]);
    const out = await runAssistantTurn({ ...base(llm), userText: 'quero enviar 2 mil mensagens' });
    expect(out.draft?.id).toBe('CAMP-2026-000001');
    expect(out.draft?.state).toBe('DRAFT');
    expect(out.toolTrace).toHaveLength(1);
    expect(out.reply).toContain('CAMP-2026-000001');
    // Na 2ª chamada, o system prompt já reflete o estado atualizado do rascunho.
    expect(llm.requests[1]!.system).toContain('CAMP-2026-000001');
  });

  it('para com segurança se exceder o limite de iterações (spec §23, §24)', async () => {
    // Sempre pede ferramenta, nunca conclui.
    const loop: LlmResponse = {
      content: [{ type: 'tool_use', id: 't', name: 'list_senders', input: {} }],
      stopReason: 'tool_use',
    };
    const llm = new ScriptedLlm(Array.from({ length: 10 }, () => ({ ...loop })));
    const out = await runAssistantTurn({ ...base(llm), userText: 'x', maxIterations: 3 });
    expect(out.toolTrace).toHaveLength(3);
    expect(out.reply).toContain('parei por segurança');
  });
});

describe('exposição das ferramentas ao LLM (spec §26)', () => {
  it('todas têm nome, descrição e input_schema de objeto', () => {
    expect(LLM_TOOLS.length).toBeGreaterThanOrEqual(20);
    for (const t of LLM_TOOLS) {
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.input_schema.type).toBe('object');
    }
    expect(LLM_TOOLS.map((t) => t.name)).toContain('start_campaign');
    expect(LLM_TOOLS.map((t) => t.name)).toContain('approve_campaign');
  });
});
