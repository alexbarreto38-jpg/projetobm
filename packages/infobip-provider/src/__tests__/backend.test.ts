import type { AssistantContext } from '@wise/assistant';
import { beforeEach, describe, expect, it } from 'vitest';
import { InfobipAssistantBackend, ingestDeliveryReports } from '../backend.js';
import { InfobipClient } from '../client.js';
import { InMemoryCampaignStore, InMemoryContactListStore } from '../store.js';

const ctx: AssistantContext = {
  userId: 'u1',
  organizationId: 'org1',
  hasPermission: () => true,
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function routerFetch(): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.endsWith('/account/1/balance')) return jsonResponse(200, { balance: 42.8, currency: 'BRL' });
    if (u.includes('/templates')) {
      return jsonResponse(200, {
        templates: [
          {
            name: 'confirmacao_pagamento',
            language: 'pt_BR',
            status: 'APPROVED',
            category: 'UTILITY',
            structure: { body: { text: 'Olá {{1}}, confirmado para {{2}}.' } },
          },
        ],
      });
    }
    if (u.endsWith('/whatsapp/1/message/template') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { messages: { to: string; messageId: string }[] };
      return jsonResponse(200, {
        messages: body.messages.map((m) => ({
          to: m.to,
          messageId: m.messageId,
          status: { groupName: 'PENDING' },
        })),
      });
    }
    return jsonResponse(404, {});
  }) as unknown as typeof fetch;
}

function makeBackend() {
  const lists = new InMemoryContactListStore();
  const campaigns = new InMemoryCampaignStore();
  const client = new InfobipClient({ baseUrl: 'https://x.api.infobip.com', apiKey: 'k', fetchImpl: routerFetch() });
  const backend = new InfobipAssistantBackend({
    client,
    senders: [{ id: 's1', number: '5511999994587', label: 'Empresa X' }],
    lists,
    campaigns,
    pricePerMessage: 0.05,
    currency: 'BRL',
  });
  return { backend, lists, campaigns };
}

const DRAFT_ID = 'CAMP-2026-000001';

describe('InfobipAssistantBackend', () => {
  let ctxBackend: ReturnType<typeof makeBackend>;
  beforeEach(async () => {
    ctxBackend = makeBackend();
    await ctxBackend.lists.set('l1', {
      columns: ['nome', 'telefone', 'data'],
      rows: [
        { nome: 'Maria', telefone: '11977776666', data: '20/08' },
        { nome: 'Ana', telefone: '11988887777', data: '21/08' },
        { nome: 'Dup', telefone: '11977776666', data: '22/08' },
        { nome: 'Bad', telefone: '123', data: 'x' },
        { nome: 'SemTel', telefone: '', data: 'y' },
      ],
    });
  });

  it('lista senders e resolve por final do número (spec §8)', async () => {
    const senders = await ctxBackend.backend.listSenders(ctx);
    expect(senders).toHaveLength(1);
    expect(senders[0]!.displayNumber).toBe('final 4587');
    const resolved = await ctxBackend.backend.resolveSender(ctx, 'número final 4587');
    expect(resolved).toHaveLength(1);
  });

  it('agrega templates com aprovação por sender e variáveis (spec §9, §10)', async () => {
    const tpl = await ctxBackend.backend.getTemplate(ctx, 'confirmacao_pagamento');
    expect(tpl?.status).toBe('APPROVED');
    expect(tpl?.variables).toEqual(['1', '2']);
    expect(tpl?.approvedSenderIds).toContain('s1');
  });

  it('valida a lista: total/válidos/inválidos/duplicados/faltantes (spec §7)', async () => {
    const v = await ctxBackend.backend.validateContactList(ctx, 'l1');
    expect(v.total).toBe(5);
    expect(v.valid).toBe(2);
    expect(v.invalid).toBe(1);
    expect(v.duplicated).toBe(1);
    expect(v.missingRequired).toBe(1);
  });

  it('lê saldo real e estima custo quando há preço (spec §11)', async () => {
    const balance = await ctxBackend.backend.getBalance(ctx);
    expect(balance).toEqual({ available: 42.8, currency: 'BRL', supported: true });
    const cost = await ctxBackend.backend.estimateCost(ctx, 2);
    expect(cost.supported).toBe(true);
    expect(cost.totalCost).toBe(0.1);
  });

  it('cria, envia em lote e acompanha via relatórios de entrega (spec §15, §16, §31)', async () => {
    const slots = {
      senderId: 's1',
      templateId: 'confirmacao_pagamento',
      templateName: 'confirmacao_pagamento',
      templateLanguage: 'pt_BR',
      listRef: 'l1',
      variableMapping: { '1': 'nome', '2': 'data' },
    };
    const { backendCampaignId } = await ctxBackend.backend.createCampaign(ctx, DRAFT_ID, slots);
    expect(backendCampaignId).toBe(DRAFT_ID);

    // Idempotência: recriar devolve a mesma campanha (spec §19, §23).
    const again = await ctxBackend.backend.createCampaign(ctx, DRAFT_ID, slots);
    expect(again.backendCampaignId).toBe(DRAFT_ID);

    const started = await ctxBackend.backend.startCampaign(ctx, DRAFT_ID);
    expect(started.status).toBe('RUNNING');

    let status = await ctxBackend.backend.getCampaignStatus(ctx, DRAFT_ID);
    expect(status.total).toBe(2); // 2 válidos (dup + inválido + sem tel excluídos)
    expect(status.pending).toBe(2);

    await ingestDeliveryReports(ctxBackend.campaigns, [
      { messageId: `${DRAFT_ID}::+5511977776666`, status: { groupName: 'DELIVERED' } },
      {
        messageId: `${DRAFT_ID}::+5511988887777`,
        status: { groupName: 'REJECTED' },
        error: { description: 'número bloqueado' },
      },
    ]);

    status = await ctxBackend.backend.getCampaignStatus(ctx, DRAFT_ID);
    expect(status.delivered).toBe(1);
    expect(status.failed).toBe(1);
    expect(status.pending).toBe(0);
    expect(status.status).toBe('COMPLETED');

    const report = await ctxBackend.backend.getCampaignReport(ctx, DRAFT_ID);
    expect(report.deliveryRate).toBeCloseTo(0.5);
    expect(report.topErrorReason).toBe('número bloqueado');
    expect(report.cost).toBe(0.1);
  });

  it('recarga por API não é suportada no Infobip (spec §12)', async () => {
    const prep = await ctxBackend.backend.prepareRecharge(ctx, 30);
    expect(prep.supported).toBe(false);
  });
});
