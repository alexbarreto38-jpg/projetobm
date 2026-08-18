import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchTool, type DispatchOutput } from '../dispatcher.js';
import { DEFAULT_SAFETY_POLICY } from '../policy.js';
import type { CampaignDraft } from '../session.js';
import type { AssistantContext } from '../backend.js';
import type { ToolExecContext } from '../tools.js';
import { adminContext, fakeContext, FakeBackend } from './fakes.js';

/** Executor de teste que encadeia o rascunho entre chamadas de ferramenta. */
class Runner {
  draft: CampaignDraft | null = null;
  seq = 1;
  constructor(
    public backend: FakeBackend,
    public ctx: AssistantContext,
  ) {}

  exec(): ToolExecContext {
    return {
      ctx: this.ctx,
      backend: this.backend,
      draft: this.draft,
      policy: DEFAULT_SAFETY_POLICY,
      now: () => new Date('2026-08-18T10:00:00Z'),
      allocateCampaignId: () => Promise.resolve(`CAMP-2026-${String(this.seq++).padStart(6, '0')}`),
    };
  }

  async call(name: string, input: unknown = {}): Promise<DispatchOutput> {
    const out = await dispatchTool(this.exec(), name, input);
    if (out.draft !== undefined) this.draft = out.draft;
    return out;
  }
}

async function prepareThroughPreview(r: Runner) {
  await r.call('create_campaign_draft', { name: 'Clientes Agosto' });
  await r.call('select_sender', { senderId: 'snd_1' });
  await r.call('select_template', { nameOrId: 'confirmacao_pagamento' });
  await r.call('attach_contact_list', { listRef: 'import_1' });
  await r.call('map_template_variables', { mapping: { '1': 'nome', '2': 'data_atendimento' } });
  await r.call('set_schedule', { scheduledAt: null });
  return r.call('generate_campaign_preview');
}

describe('fluxo completo de disparo (spec §13, §14, §15)', () => {
  let backend: FakeBackend;
  let r: Runner;
  beforeEach(() => {
    backend = new FakeBackend();
    r = new Runner(backend, adminContext());
  });

  it('caminho feliz: rascunho → prévia → aprovação → início', async () => {
    const preview = await prepareThroughPreview(r);
    expect(preview.result.ok).toBe(true);
    expect(r.draft?.state).toBe('PREPARED');
    const data = preview.result.data as Record<string, unknown>;
    expect(data.estimatedCount).toBe(2041);
    expect(data.estimatedCost).toBe(Number((2041 * 0.05).toFixed(2)));
    expect(data.sampleMessage).toBe('Olá Maria, seu atendimento está confirmado para 20/08.');

    await r.call('request_campaign_approval');
    expect(r.draft?.state).toBe('AWAITING_APPROVAL');

    const approved = await r.call('approve_campaign', { utterance: 'pode enviar' });
    expect(approved.result.ok).toBe(true);
    expect(r.draft?.state).toBe('APPROVED');

    const started = await r.call('start_campaign');
    expect(started.result.ok).toBe(true);
    expect(started.result.outcome).toBe('processing'); // nunca "confirmed"/"enviado" (spec §24)
    expect(r.draft?.state).toBe('EXECUTING');
    expect(backend.started).toEqual(['bk_' + r.draft!.id]);
    expect(backend.audits.map((a) => a.action)).toContain('ASSISTANT_CAMPAIGN_STARTED');
  });

  it('não inicia antes da aprovação', async () => {
    await prepareThroughPreview(r);
    await r.call('request_campaign_approval');
    const started = await r.call('start_campaign');
    expect(started.result.ok).toBe(false);
    expect(started.result.errorCode).toBe('NOT_APPROVED');
    expect(backend.started).toEqual([]);
  });

  it('aprovação fica inválida se a configuração muda depois (spec §14, §24)', async () => {
    await prepareThroughPreview(r);
    await r.call('request_campaign_approval');
    await r.call('approve_campaign', { utterance: 'pode enviar' });
    expect(r.draft?.state).toBe('APPROVED');

    // Troca o remetente após aprovar → volta a DRAFT, aprovação descartada.
    await r.call('select_sender', { senderId: 'snd_1' }); // mesmo remetente: hash igual, segue APPROVED
    expect(r.draft?.state).toBe('APPROVED');

    // Agora muda de verdade a lista (recria com outro total não é possível aqui;
    // simulamos mudança de horário, que é slot relevante).
    await r.call('set_schedule', { scheduledAt: '2026-09-01T12:00:00.000Z' });
    expect(r.draft?.state).toBe('DRAFT');

    const started = await r.call('start_campaign');
    expect(started.result.ok).toBe(false);
    expect(started.result.errorCode).toBe('NOT_APPROVED');
  });

  it('gera a prévia somente com todos os campos essenciais', async () => {
    await r.call('create_campaign_draft', {});
    await r.call('select_sender', { senderId: 'snd_1' });
    const preview = await r.call('generate_campaign_preview');
    expect(preview.result.ok).toBe(false);
    expect(preview.result.errorCode).toBe('PREVIEW_INCOMPLETE');
  });
});

describe('recusas de seleção (spec §8, §9)', () => {
  let backend: FakeBackend;
  let r: Runner;
  beforeEach(() => {
    backend = new FakeBackend();
    r = new Runner(backend, adminContext());
  });

  it('recusa remetente pausado', async () => {
    await r.call('create_campaign_draft', {});
    const out = await r.call('select_sender', { senderId: 'snd_2' });
    expect(out.result.errorCode).toBe('SENDER_PAUSED');
  });

  it('recusa template não aprovado', async () => {
    await r.call('create_campaign_draft', {});
    const out = await r.call('select_template', { nameOrId: 'promo_agosto' });
    expect(out.result.errorCode).toBe('TEMPLATE_NOT_APPROVED');
  });

  it('recusa template não habilitado para o remetente', async () => {
    await r.call('create_campaign_draft', {});
    await r.call('select_sender', { senderId: 'snd_1' });
    backend.templates[0]!.approvedSenderIds = ['snd_outro'];
    const out = await r.call('select_template', { nameOrId: 'confirmacao_pagamento' });
    expect(out.result.errorCode).toBe('TEMPLATE_SENDER_MISMATCH');
  });
});

describe('permissões (spec §19)', () => {
  it('nega ferramenta sem permissão e registra auditoria — insistir não contorna', async () => {
    const backend = new FakeBackend();
    // Operador sem campaign:execute.
    const r = new Runner(backend, fakeContext(['campaign:read', 'campaign:write', 'account:read', 'template:read', 'contact:write']));
    await r.call('create_campaign_draft', {});
    const out = await r.call('start_campaign');
    expect(out.result.errorCode).toBe('PERMISSION_DENIED');
    expect(backend.audits.some((a) => a.action === 'ASSISTANT_TOOL_DENIED')).toBe(true);
  });
});

describe('segunda aprovação para grandes volumes (spec §20)', () => {
  it('exige um segundo administrador diferente', async () => {
    const backend = new FakeBackend();
    // Lista grande: 6000 válidos → acima de 5000.
    backend.lists['big'] = {
      listRef: 'big',
      total: 6000,
      valid: 6000,
      invalid: 0,
      duplicated: 0,
      missingRequired: 0,
      columns: ['nome', 'telefone', 'data_atendimento'],
      sampleRow: { nome: 'Ana', telefone: '+5511900000000', data_atendimento: '21/08' },
    };
    const r = new Runner(backend, adminContext({ userId: 'admin_A' }));
    await r.call('create_campaign_draft', {});
    await r.call('select_sender', { senderId: 'snd_1' });
    await r.call('select_template', { nameOrId: 'confirmacao_pagamento' });
    await r.call('attach_contact_list', { listRef: 'big' });
    await r.call('map_template_variables', { mapping: { '1': 'nome', '2': 'data_atendimento' } });
    await r.call('generate_campaign_preview');
    await r.call('request_campaign_approval');

    const first = await r.call('approve_campaign', { utterance: 'pode enviar' });
    expect(first.result.outcome).toBe('planned');
    expect((first.result.data as { needsSecondApproval?: boolean }).needsSecondApproval).toBe(true);
    expect(r.draft?.state).toBe('AWAITING_APPROVAL');

    // Mesmo admin tentando de novo é recusado.
    const sameAgain = await r.call('approve_campaign', { utterance: 'confirmo' });
    expect(sameAgain.result.errorCode).toBe('SECOND_APPROVER_MUST_DIFFER');

    // Segundo admin diferente aprova.
    r.ctx = adminContext({ userId: 'admin_B' });
    const second = await r.call('approve_campaign', { utterance: 'aprovado' });
    expect(second.result.ok).toBe(true);
    expect(r.draft?.state).toBe('APPROVED');
  });
});

describe('recarga (spec §12)', () => {
  it('prepara e só executa com confirm=true; é idempotente', async () => {
    const backend = new FakeBackend();
    const r = new Runner(backend, adminContext());
    const prep = await r.call('request_account_recharge', { amount: 30 });
    expect(prep.result.outcome).toBe('planned');

    const exec1 = await r.call('execute_authorized_recharge', { amount: 30, confirm: true, reference: 'rc-1' });
    expect(exec1.result.ok).toBe(true);
    const exec2 = await r.call('execute_authorized_recharge', { amount: 30, confirm: true, reference: 'rc-1' });
    expect(exec2.result.ok).toBe(true);
    expect(backend.recharges).toHaveLength(1); // idempotência (spec §23)
  });

  it('informa quando a recarga por API não é suportada (spec §12)', async () => {
    const backend = new FakeBackend();
    backend.rechargeSupported = false;
    const r = new Runner(backend, adminContext());
    const prep = await r.call('request_account_recharge', { amount: 30 });
    expect(prep.result.errorCode).toBe('RECHARGE_UNSUPPORTED');
  });
});

describe('argumentos inválidos (spec §22)', () => {
  it('rejeita input malformado com mensagem clara', async () => {
    const backend = new FakeBackend();
    const r = new Runner(backend, adminContext());
    const out = await r.call('estimate_campaign_cost', { count: -5, templateId: 'tpl_1' });
    expect(out.result.errorCode).toBe('INVALID_ARGUMENTS');
  });
});
