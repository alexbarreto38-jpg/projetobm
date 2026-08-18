/**
 * DEMO executável do Módulo 1 sobre o Infobip — SEM segredos.
 *
 * Exercita o código de produção de verdade (dispatcher + máquina de estados +
 * guardrails + InfobipAssistantBackend + InfobipClient) contra um Infobip
 * SIMULADO (stub de fetch). Mostra o fluxo completo: rascunho → remetente →
 * template → lista (validação) → mapeamento → saldo → PRÉVIA → aprovação →
 * disparo (envio em lote) → relatórios de entrega → andamento/relatório.
 *
 * A única peça não exercitada aqui é a interpretação em linguagem natural do
 * LLM (precisa de ANTHROPIC_API_KEY). Simulamos a decisão do modelo chamando as
 * MESMAS ferramentas que ele chamaria — tudo o que roda abaixo é o código real.
 *
 *   pnpm --filter @wise/api exec tsx scripts/assistant-infobip-demo.ts
 */
import type { AssistantContext } from '@wise/assistant';
import { dispatchTool, type ToolExecContext } from '@wise/assistant';
import {
  InfobipAssistantBackend,
  InfobipClient,
  InMemoryCampaignStore,
  InMemoryContactListStore,
  ingestDeliveryReports,
} from '@wise/infobip-provider';

// --- Infobip SIMULADO (stub de fetch) --------------------------------------
function fakeInfobipFetch(): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    const json = (status: number, body: unknown) =>
      ({ ok: status < 300, status, text: async () => JSON.stringify(body) }) as Response;

    if (u.endsWith('/account/1/balance')) return json(200, { balance: 42.8, currency: 'BRL' });
    if (u.includes('/templates')) {
      return json(200, {
        templates: [
          {
            name: 'confirmacao_pagamento',
            language: 'pt_BR',
            status: 'APPROVED',
            category: 'UTILITY',
            structure: { body: { text: 'Olá {{1}}, seu atendimento está confirmado para {{2}}.' } },
          },
        ],
      });
    }
    if (u.endsWith('/whatsapp/1/message/template') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { messages: { to: string; messageId: string }[] };
      return json(200, {
        messages: body.messages.map((m) => ({ to: m.to, messageId: m.messageId, status: { groupName: 'PENDING' } })),
      });
    }
    return json(404, {});
  }) as unknown as typeof fetch;
}

const ctx: AssistantContext = {
  userId: 'op_maria',
  organizationId: 'org_empresa_x',
  hasPermission: () => true, // no demo, operador com todas as permissões
};

async function main() {
  const lists = new InMemoryContactListStore();
  const campaigns = new InMemoryCampaignStore();

  // Lista recebida "pelo WhatsApp" (CSV já parseado) — com inválidos e duplicado.
  await lists.set('clientes_agosto', {
    columns: ['nome', 'telefone', 'data_atendimento'],
    rows: [
      { nome: 'Maria', telefone: '11977776666', data_atendimento: '20/08' },
      { nome: 'João', telefone: '11988887777', data_atendimento: '20/08' },
      { nome: 'Ana', telefone: '11977776666', data_atendimento: '21/08' }, // duplicado
      { nome: 'Carlos', telefone: '123', data_atendimento: '21/08' }, // inválido
      { nome: 'SemTel', telefone: '', data_atendimento: '22/08' }, // faltando
    ],
  });

  const backend = new InfobipAssistantBackend({
    client: new InfobipClient({ baseUrl: 'https://demo.api.infobip.com', apiKey: 'demo', fetchImpl: fakeInfobipFetch() }),
    senders: [{ id: 'empresa-x', number: '5511999994587', label: 'Empresa X' }],
    lists,
    campaigns,
    pricePerMessage: 0.05,
    currency: 'BRL',
  });

  let draft: ToolExecContext['draft'] = null;
  let seq = 0;
  const exec = (): ToolExecContext => ({
    ctx,
    backend,
    draft,
    policy: {
      maxMessagesWithoutSecondApproval: 5000,
      hardMaxMessagesPerOperation: 200000,
      maxCostPerOperation: 1000,
      maxDailyCost: 5000,
    },
    now: () => new Date('2026-08-18T10:00:00Z'),
    allocateCampaignId: () => Promise.resolve(`CAMP-2026-${String(++seq).padStart(6, '0')}`),
  });

  async function step(user: string | null, tool: string, input: unknown = {}) {
    if (user) console.log(`\n\x1b[36m👤 usuário:\x1b[0m ${user}`);
    const out = await dispatchTool(exec(), tool, input);
    if (out.draft !== undefined) draft = out.draft;
    const r = out.result;
    const tag = r.ok ? `\x1b[32m✓ ${r.outcome}\x1b[0m` : `\x1b[31m✗ ${r.errorCode}\x1b[0m`;
    console.log(`\x1b[90m   → ${tool}\x1b[0m  ${tag}`);
    if (r.message) console.log(`     ${r.message}`);
    return out.result;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' DEMO — Assistente de envios (Infobip simulado, sem segredos)');
  console.log('═══════════════════════════════════════════════════════════');

  await step('Preciso fazer uns 2 mil envios hoje usando o número da Empresa X.', 'create_campaign_draft', { name: 'Clientes Agosto' });
  await step(null, 'select_sender', { senderId: 'empresa-x' });
  await step('Usa o template confirmação_pagamento.', 'select_template', { nameOrId: 'confirmacao_pagamento' });

  console.log('\n\x1b[36m👤 usuário:\x1b[0m (envia a lista clientes_agosto.csv)');
  const val = (await step(null, 'attach_contact_list', { listRef: 'clientes_agosto' })).data as Record<string, number>;
  console.log(`     Recebi ${val.total} registros: ${val.valid} válidos, ${val.duplicated} duplicado(s), ${val.invalid} inválido(s), ${val.missingRequired} sem telefone.`);

  await step(null, 'map_template_variables', { mapping: { '1': 'nome', '2': 'data_atendimento' } });

  const balance = (await step('Confere o saldo e me mostra a prévia.', 'get_account_balance')).data as { available: number; currency: string };
  console.log(`     Saldo disponível: R$ ${balance.available.toFixed(2)} ${balance.currency}`);

  const preview = (await step(null, 'generate_campaign_preview')).data as Record<string, unknown>;
  console.log('\n\x1b[33m── PRÉVIA DO ENVIO ──────────────────────────────────────\x1b[0m');
  console.log(`  Campanha:   ${preview.campaignId}  (${preview.name})`);
  console.log(`  Remetente:  ${preview.senderLabel}`);
  console.log(`  Público:    ${preview.audienceTotal} recebidos → ${preview.audienceValid} válidos`);
  console.log(`  Template:   ${preview.templateName} (${preview.templateCategory}, ${preview.templateLanguage})`);
  console.log(`  Variáveis:  ${JSON.stringify(preview.variableMapping)}`);
  console.log(`  Horário:    ${preview.schedule}`);
  console.log(`  Custo est.: R$ ${(preview.estimatedCost as number).toFixed(2)}   |  Saldo: R$ ${(preview.balance as number).toFixed(2)}`);
  console.log(`  Mensagem:   "${preview.sampleMessage}"`);
  console.log('\x1b[33m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('  Assistente: "Revise as informações. Posso realizar o envio?"');

  await step(null, 'request_campaign_approval');

  // Trava de segurança: tentar disparar ANTES de aprovar é recusado.
  await step('(tenta pular a aprovação)', 'start_campaign');

  await step('Pode enviar.', 'approve_campaign', { utterance: 'Pode enviar.' });
  const started = (await step(null, 'start_campaign')).data as { campaignId: string; backendCampaignId: string };
  console.log(`     Campanha ${started.campaignId} iniciada — envio ENFILEIRADO no Infobip (não "concluído").`);

  // Simula os relatórios de entrega chegando pelo webhook do Infobip.
  const bkId = started.backendCampaignId;
  await ingestDeliveryReports(campaigns, [
    { messageId: `${started.campaignId}::+5511977776666`, status: { groupName: 'DELIVERED' } },
    { messageId: `${started.campaignId}::+5511988887777`, status: { groupName: 'REJECTED' }, error: { description: 'número inválido' } },
  ]);

  const status = (await step('Como está o envio?', 'get_campaign_status', { backendCampaignId: bkId })).data as Record<string, number>;
  console.log(`     Total ${status.total} · entregues ${status.delivered} · pendentes ${status.pending} · falhas ${status.failed}`);

  const report = (await step('Me manda o relatório.', 'get_campaign_report', { backendCampaignId: bkId })).data as Record<string, unknown>;
  console.log('\n\x1b[33m── RELATÓRIO ─────────────────────────────────────────────\x1b[0m');
  console.log(`  Entregues: ${report.delivered}/${report.total}  (taxa ${(Number(report.deliveryRate) * 100).toFixed(1)}%)`);
  console.log(`  Falhas: ${report.failed}${report.topErrorReason ? ` — principal motivo: ${report.topErrorReason}` : ''}`);
  console.log(`  Custo: R$ ${(report.cost as number).toFixed(2)}`);
  console.log('\x1b[33m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('\n\x1b[32m✔ Fluxo completo executado com o código real (Infobip simulado).\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
