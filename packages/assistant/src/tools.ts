import type { Permission } from '@wise/types';
import { z } from 'zod';
import type { AssistantBackend, AssistantContext } from './backend.js';
import { evaluatePolicy, type SafetyPolicy } from './policy.js';
import { renderTemplateSample, unmappedVariables } from './render.js';
import { fail, ok, type ToolResult } from './result.js';
import {
  approvalIsValid,
  computeConfigHash,
  isReadyForPreview,
  missingSlots,
  newDraft,
  patchSlots,
  transition,
  type CampaignDraft,
} from './session.js';

/**
 * Ferramentas do assistente (spec §26). Cada uma declara sua sensibilidade e a
 * permissão exigida; o dispatcher (`dispatcher.ts`) aplica esses guardrails
 * ANTES de executar. Ações que mudam a sessão devolvem o draft atualizado.
 */
export type ToolSensitivity =
  | 'read' //      consulta; não muda nada
  | 'prepare' //   muda o rascunho; reversível
  | 'sensitive'; // irreversível/financeiro; exige pré-condições de estado (spec §13, §14, §24)

export interface ToolExecContext {
  ctx: AssistantContext;
  backend: AssistantBackend;
  draft: CampaignDraft | null;
  policy: SafetyPolicy;
  now: () => Date;
  /** Aloca o próximo id humano de campanha (CAMP-...), provido pela API (spec §23). */
  allocateCampaignId: () => Promise<string>;
}

export interface ToolExecResult {
  result: ToolResult;
  draft?: CampaignDraft;
}

export interface ToolDefinition<I = unknown> {
  name: string;
  description: string;
  sensitivity: ToolSensitivity;
  requiredPermission: Permission;
  inputSchema: z.ZodType<I>;
  execute: (exec: ToolExecContext, input: I) => Promise<ToolExecResult>;
}

// Helper: garante que existe um rascunho ativo antes de operar sobre ele.
function requireDraft(exec: ToolExecContext): CampaignDraft {
  if (!exec.draft) {
    throw new ToolPreconditionError(
      'Nenhuma campanha em preparação nesta conversa. Crie um rascunho antes (create_campaign_draft).',
    );
  }
  return exec.draft;
}

export class ToolPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPreconditionError';
  }
}

function def<I>(d: ToolDefinition<I>): ToolDefinition<I> {
  return d;
}

const emptyInput = z.object({}).strict();

// ---------------------------------------------------------------------------
// Consultas (spec §26 — leitura pura)
// ---------------------------------------------------------------------------

const getAccountBalance = def({
  name: 'get_account_balance',
  description:
    'Consulta o saldo disponível da conta. Nem toda infraestrutura expõe saldo; nesse caso retorna supported:false (spec §11).',
  sensitivity: 'read',
  requiredPermission: 'account:read',
  inputSchema: emptyInput,
  async execute(exec) {
    const balance = await exec.backend.getBalance(exec.ctx);
    return { result: ok('confirmed', balance) };
  },
});

const listSenders = def({
  name: 'list_senders',
  description: 'Lista os remetentes/números disponíveis para envio (spec §8).',
  sensitivity: 'read',
  requiredPermission: 'account:read',
  inputSchema: emptyInput,
  async execute(exec) {
    return { result: ok('confirmed', await exec.backend.listSenders(exec.ctx)) };
  },
});

const getSender = def({
  name: 'get_sender',
  description:
    'Resolve um remetente por descrição natural (ex.: "número final 4587"). Se houver ambiguidade, retorna vários — pergunte ao usuário, nunca escolha por conta própria (spec §8).',
  sensitivity: 'read',
  requiredPermission: 'account:read',
  inputSchema: z.object({
    query: z.string().min(1).describe('Descrição do remetente informada pelo usuário.'),
  }),
  async execute(exec, input) {
    return { result: ok('confirmed', await exec.backend.resolveSender(exec.ctx, input.query)) };
  },
});

const listTemplates = def({
  name: 'list_templates',
  description: 'Lista os templates disponíveis (nome, status, categoria, idioma) (spec §9).',
  sensitivity: 'read',
  requiredPermission: 'template:read',
  inputSchema: emptyInput,
  async execute(exec) {
    return { result: ok('confirmed', await exec.backend.listTemplates(exec.ctx)) };
  },
});

const getTemplate = def({
  name: 'get_template',
  description:
    'Consulta um template por nome ou id: existência, aprovação, idioma, categoria e variáveis necessárias (spec §9, §10).',
  sensitivity: 'read',
  requiredPermission: 'template:read',
  inputSchema: z.object({ nameOrId: z.string().min(1) }),
  async execute(exec, input) {
    const tpl = await exec.backend.getTemplate(exec.ctx, input.nameOrId);
    if (!tpl) return { result: fail(`Template "${input.nameOrId}" não encontrado.`, 'TEMPLATE_NOT_FOUND') };
    return { result: ok('confirmed', tpl) };
  },
});

const estimateCampaignCost = def({
  name: 'estimate_campaign_cost',
  description:
    'Estima o custo de enviar N mensagens com um template, quando a infraestrutura permite (spec §11). Caso contrário, supported:false.',
  sensitivity: 'read',
  requiredPermission: 'campaign:read',
  inputSchema: z.object({ count: z.number().int().positive(), templateId: z.string().min(1) }),
  async execute(exec, input) {
    return { result: ok('confirmed', await exec.backend.estimateCost(exec.ctx, input.count, input.templateId)) };
  },
});

// ---------------------------------------------------------------------------
// Preparação do rascunho (spec §5, §6, §7, §8, §9, §10 — reversível)
// ---------------------------------------------------------------------------

const createCampaignDraft = def({
  name: 'create_campaign_draft',
  description:
    'Cria a sessão/rascunho da campanha (spec §5). Chame assim que identificar a intenção de enviar. Retorna o id (CAMP-...).',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:write',
  inputSchema: z.object({
    name: z.string().min(1).optional().describe('Nome da campanha, se o usuário informou.'),
  }),
  async execute(exec, input) {
    if (exec.draft && exec.draft.state !== 'CANCELLED' && exec.draft.state !== 'COMPLETED') {
      return {
        result: fail(
          `Já existe uma campanha em preparação (${exec.draft.id}, ${exec.draft.state}). Finalize ou cancele antes de criar outra.`,
          'DRAFT_ALREADY_EXISTS',
        ),
      };
    }
    const id = await exec.allocateCampaignId();
    const draft = newDraft({
      id,
      organizationId: exec.ctx.organizationId,
      requestedByUserId: exec.ctx.userId,
      slots: input.name ? { name: input.name } : {},
      now: exec.now(),
    });
    return { result: ok('confirmed', { campaignId: id, state: draft.state }), draft };
  },
});

const selectSender = def({
  name: 'select_sender',
  description: 'Fixa o remetente do rascunho após resolvê-lo. Recusa número pausado (spec §8, §25).',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:write',
  inputSchema: z.object({ senderId: z.string().min(1) }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    const senders = await exec.backend.listSenders(exec.ctx);
    const sender = senders.find((s) => s.id === input.senderId);
    if (!sender) return { result: fail('Remetente não encontrado.', 'SENDER_NOT_FOUND') };
    if (sender.paused)
      return { result: fail(`O remetente ${sender.label} está pausado e não pode enviar agora.`, 'SENDER_PAUSED') };
    const next = patchSlots(draft, { senderId: sender.id, senderLabel: sender.label }, exec.now());
    return { result: ok('confirmed', { senderLabel: sender.label, state: next.state }), draft: next };
  },
});

const selectTemplate = def({
  name: 'select_template',
  description:
    'Fixa o template do rascunho. Recusa template não aprovado ou indisponível para o remetente escolhido (spec §9).',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:write',
  inputSchema: z.object({ nameOrId: z.string().min(1) }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    const tpl = await exec.backend.getTemplate(exec.ctx, input.nameOrId);
    if (!tpl) return { result: fail(`Template "${input.nameOrId}" não encontrado.`, 'TEMPLATE_NOT_FOUND') };
    if (tpl.status !== 'APPROVED') {
      return {
        result: fail(
          `O template ${tpl.name} não está aprovado (status ${tpl.status}); não pode ser usado neste envio.`,
          'TEMPLATE_NOT_APPROVED',
        ),
      };
    }
    if (
      draft.slots.senderId &&
      tpl.approvedSenderIds &&
      !tpl.approvedSenderIds.includes(draft.slots.senderId)
    ) {
      return {
        result: fail(
          `O template ${tpl.name} não está habilitado para o remetente escolhido.`,
          'TEMPLATE_SENDER_MISMATCH',
        ),
      };
    }
    const next = patchSlots(
      draft,
      {
        templateId: tpl.id,
        templateName: tpl.name,
        templateCategory: tpl.category,
        templateLanguage: tpl.language,
        templateBody: tpl.bodyText,
      },
      exec.now(),
    );
    return {
      result: ok('confirmed', { templateName: tpl.name, variables: tpl.variables, state: next.state }),
      draft: next,
    };
  },
});

const attachContactList = def({
  name: 'attach_contact_list',
  description:
    'Valida e anexa ao rascunho uma lista já recebida (por referência). Retorna totais e colunas para o mapeamento (spec §6, §7).',
  sensitivity: 'prepare',
  requiredPermission: 'contact:write',
  inputSchema: z.object({
    listRef: z.string().min(1).describe('Referência da lista/import recebida do usuário.'),
  }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    const v = await exec.backend.validateContactList(exec.ctx, input.listRef);
    const next = patchSlots(
      draft,
      {
        listRef: v.listRef,
        audienceTotal: v.total,
        audienceValid: v.valid,
        audienceInvalid: v.invalid,
        audienceDuplicated: v.duplicated,
        sampleRow: v.sampleRow,
      },
      exec.now(),
    );
    return { result: ok('confirmed', v), draft: next };
  },
});

const mapTemplateVariables = def({
  name: 'map_template_variables',
  description:
    'Mapeia as variáveis do template ({{1}}, {{2}}...) para colunas da lista (spec §10). Deve aparecer na prévia.',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:write',
  inputSchema: z.object({
    mapping: z
      .record(z.string())
      .describe('Objeto { "1": "nome", "2": "data_atendimento" } (variável → coluna).'),
  }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    const next = patchSlots(draft, { variableMapping: input.mapping }, exec.now());
    return { result: ok('confirmed', { variableMapping: input.mapping, state: next.state }), draft: next };
  },
});

const setSchedule = def({
  name: 'set_schedule',
  description: 'Define o horário do envio. Omitir/null = envio imediato (spec §13).',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:write',
  inputSchema: z.object({
    scheduledAt: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .describe('ISO 8601, ou null para envio imediato.'),
  }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    const next = patchSlots(draft, { scheduledAt: input.scheduledAt ?? null }, exec.now());
    return { result: ok('confirmed', { scheduledAt: next.slots.scheduledAt, state: next.state }), draft: next };
  },
});

// ---------------------------------------------------------------------------
// Prévia + aprovação (spec §13, §14)
// ---------------------------------------------------------------------------

const generateCampaignPreview = def({
  name: 'generate_campaign_preview',
  description:
    'Monta a PRÉVIA OBRIGATÓRIA do envio (spec §13): consolida remetente, público, template, mapeamento, custo, saldo e uma mensagem de exemplo. Move o rascunho para PREPARED. Só é possível com todos os campos essenciais preenchidos.',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:read',
  inputSchema: emptyInput,
  async execute(exec) {
    const draft = requireDraft(exec);
    const missing = missingSlots(draft.slots);
    if (!isReadyForPreview(draft.slots)) {
      return {
        result: fail(
          `Ainda faltam informações para a prévia: ${missing.join(', ')}.`,
          'PREVIEW_INCOMPLETE',
        ),
      };
    }
    const slots = draft.slots;
    const count = slots.audienceValid ?? 0;

    // Variáveis sem mapeamento bloqueiam a prévia (spec §10).
    const templateVars = Object.keys(slots.variableMapping ?? {});
    if (slots.templateBody) {
      const declared = [...slots.templateBody.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!);
      const unmapped = unmappedVariables(declared, slots.variableMapping ?? {});
      if (unmapped.length > 0) {
        return {
          result: fail(
            `Faltam mapear as variáveis do template: ${unmapped.map((v) => `{{${v}}}`).join(', ')}.`,
            'VARIABLES_UNMAPPED',
          ),
        };
      }
    }
    void templateVars;

    const [estimate, balance] = await Promise.all([
      exec.backend.estimateCost(exec.ctx, count, slots.templateId!),
      exec.backend.getBalance(exec.ctx),
    ]);

    const withEstimate = patchSlots(
      draft,
      {
        estimatedCount: count,
        estimatedCost: estimate.totalCost ?? undefined,
        balance: balance.available ?? undefined,
        currency: estimate.currency,
      },
      exec.now(),
    );
    const prepared = transition(withEstimate, 'PREPARED', exec.now());

    const sampleMessage = slots.templateBody
      ? renderTemplateSample(slots.templateBody, slots.variableMapping ?? {}, slots.sampleRow)
      : '(corpo do template indisponível)';

    const preview = {
      campaignId: prepared.id,
      name: slots.name,
      senderLabel: slots.senderLabel,
      audienceTotal: slots.audienceTotal,
      audienceValid: count,
      templateName: slots.templateName,
      templateCategory: slots.templateCategory,
      templateLanguage: slots.templateLanguage,
      variableMapping: slots.variableMapping ?? {},
      schedule: slots.scheduledAt ?? 'envio imediato',
      estimatedCount: count,
      estimatedCost: estimate.totalCost,
      costSupported: estimate.supported,
      balance: balance.available,
      balanceSupported: balance.supported,
      currency: estimate.currency,
      sampleMessage,
      // Alerta de saldo insuficiente (spec §11) — informativo, não bloqueia aqui.
      insufficientBalance:
        balance.available !== null && estimate.totalCost !== null
          ? balance.available < estimate.totalCost
          : false,
    };
    return { result: ok('confirmed', preview), draft: prepared };
  },
});

const requestCampaignApproval = def({
  name: 'request_campaign_approval',
  description:
    'Após apresentar a prévia ao usuário, coloca a campanha em AGUARDANDO_APROVAÇÃO e pergunta se pode enviar (spec §13, §14).',
  sensitivity: 'prepare',
  requiredPermission: 'campaign:read',
  inputSchema: emptyInput,
  async execute(exec) {
    const draft = requireDraft(exec);
    if (draft.state !== 'PREPARED') {
      return {
        result: fail(
          `A campanha precisa estar PREPARED para pedir aprovação (está ${draft.state}). Gere a prévia primeiro.`,
          'NOT_PREPARED',
        ),
      };
    }
    const next = transition(draft, 'AWAITING_APPROVAL', exec.now());
    return { result: ok('confirmed', { state: next.state }), draft: next };
  },
});

const approveCampaign = def({
  name: 'approve_campaign',
  description:
    'Registra a confirmação EXPLÍCITA do usuário para ESTA campanha (spec §14). Chame SOMENTE quando o usuário autorizar claramente ("pode enviar", "está aprovado"). Passe a frase exata dele em `utterance`. Não aprova por conta própria.',
  sensitivity: 'sensitive',
  requiredPermission: 'campaign:execute',
  inputSchema: z.object({
    utterance: z.string().min(1).describe('A frase EXATA de confirmação dita pelo usuário.'),
  }),
  async execute(exec, input) {
    const draft = requireDraft(exec);
    if (draft.state !== 'AWAITING_APPROVAL') {
      return {
        result: fail(
          `Só é possível aprovar em AGUARDANDO_APROVAÇÃO (está ${draft.state}).`,
          'NOT_AWAITING_APPROVAL',
        ),
      };
    }
    const decision = evaluatePolicy(draft.slots, exec.policy);
    if (decision.verdict === 'BLOCKED') {
      return { result: fail(decision.reason, 'POLICY_BLOCKED') };
    }

    const now = exec.now();
    const configHash = computeConfigHash(draft.slots);

    // Segunda aprovação (spec §20).
    if (decision.verdict === 'SECOND_APPROVAL_REQUIRED') {
      const existing = draft.approval;
      const firstValid = existing && existing.configHash === configHash;
      if (!firstValid) {
        // Primeira aprovação registrada; permanece aguardando a segunda.
        const withFirst: CampaignDraft = {
          ...draft,
          approval: {
            configHash,
            approvedByUserId: exec.ctx.userId,
            approvedAt: now.toISOString(),
            utterance: input.utterance,
          },
          updatedAt: now.toISOString(),
        };
        await exec.backend.audit(exec.ctx, {
          action: 'ASSISTANT_CAMPAIGN_FIRST_APPROVAL',
          entityType: 'campaign',
          entityId: draft.id,
          metadata: { configHash, reason: decision.reason },
        });
        return {
          result: ok('planned', { needsSecondApproval: true, reason: decision.reason }),
          draft: withFirst,
        };
      }
      if (existing!.approvedByUserId === exec.ctx.userId) {
        return {
          result: fail(
            'A segunda aprovação precisa ser de um administrador diferente do primeiro (spec §20).',
            'SECOND_APPROVER_MUST_DIFFER',
          ),
        };
      }
      const approved = transition(
        {
          ...draft,
          approval: { ...existing!, secondApprovalByUserId: exec.ctx.userId },
          updatedAt: now.toISOString(),
        },
        'APPROVED',
        now,
      );
      await exec.backend.audit(exec.ctx, {
        action: 'ASSISTANT_CAMPAIGN_APPROVED',
        entityType: 'campaign',
        entityId: draft.id,
        metadata: { configHash, secondApproval: true },
      });
      return { result: ok('confirmed', { state: approved.state, configHash }), draft: approved };
    }

    // Aprovação simples.
    const approved = transition(
      {
        ...draft,
        approval: {
          configHash,
          approvedByUserId: exec.ctx.userId,
          approvedAt: now.toISOString(),
          utterance: input.utterance,
        },
        updatedAt: now.toISOString(),
      },
      'APPROVED',
      now,
    );
    await exec.backend.audit(exec.ctx, {
      action: 'ASSISTANT_CAMPAIGN_APPROVED',
      entityType: 'campaign',
      entityId: draft.id,
      metadata: { configHash },
    });
    return { result: ok('confirmed', { state: approved.state, configHash }), draft: approved };
  },
});

// ---------------------------------------------------------------------------
// Execução (spec §15, §16, §24 — sensível/irreversível)
// ---------------------------------------------------------------------------

const startCampaign = def({
  name: 'start_campaign',
  description:
    'Inicia o disparo. Só funciona em APPROVED com aprovação ainda válida para a configuração atual (spec §15, §24). Retorna outcome=processing: o envio foi ENFILEIRADO, não "concluído".',
  sensitivity: 'sensitive',
  requiredPermission: 'campaign:execute',
  inputSchema: emptyInput,
  async execute(exec) {
    const draft = requireDraft(exec);
    if (draft.state !== 'APPROVED') {
      return {
        result: fail(`A campanha precisa estar APROVADA para iniciar (está ${draft.state}).`, 'NOT_APPROVED'),
      };
    }
    if (!approvalIsValid(draft)) {
      // A configuração mudou após a aprovação — exige nova revisão (spec §14, §24).
      return {
        result: fail(
          'A configuração mudou desde a aprovação. Gere a prévia novamente e reobtenha a confirmação.',
          'APPROVAL_STALE',
        ),
      };
    }

    // Cria a campanha real (idempotente) e inicia. O id humano é a chave de
    // idempotência (spec §19, §23) — repetição acidental não duplica o disparo.
    const { backendCampaignId } = await exec.backend.createCampaign(exec.ctx, draft.id, draft.slots);
    const started = await exec.backend.startCampaign(exec.ctx, backendCampaignId, draft.id);

    await exec.backend.audit(exec.ctx, {
      action: 'ASSISTANT_CAMPAIGN_STARTED',
      entityType: 'campaign',
      entityId: draft.id,
      metadata: {
        backendCampaignId,
        approvedBy: draft.approval?.approvedByUserId,
        configHash: draft.approval?.configHash,
        count: draft.slots.estimatedCount,
      },
    });

    const executing = transition({ ...draft, backendCampaignId }, 'EXECUTING', exec.now());
    return {
      result: ok('processing', { campaignId: draft.id, backendCampaignId, status: started.status }),
      draft: executing,
    };
  },
});

const pauseCampaign = def({
  name: 'pause_campaign',
  description: 'Pausa um disparo em andamento, quando tecnicamente permitido (spec §26).',
  sensitivity: 'sensitive',
  requiredPermission: 'campaign:execute',
  inputSchema: z.object({ backendCampaignId: z.string().min(1) }),
  async execute(exec, input) {
    const r = await exec.backend.pauseCampaign(exec.ctx, input.backendCampaignId);
    return { result: ok('confirmed', r) };
  },
});

const cancelCampaign = def({
  name: 'cancel_campaign',
  description: 'Cancela um disparo agendado ou em andamento, quando permitido (spec §26).',
  sensitivity: 'sensitive',
  requiredPermission: 'campaign:execute',
  inputSchema: z.object({ backendCampaignId: z.string().min(1) }),
  async execute(exec, input) {
    const r = await exec.backend.cancelCampaign(exec.ctx, input.backendCampaignId);
    return { result: ok('confirmed', r) };
  },
});

const getCampaignStatus = def({
  name: 'get_campaign_status',
  description:
    'Consulta o andamento real de uma campanha (total, processados, entregues, pendentes, falhas) (spec §16). Reporte apenas o que a API retornou.',
  sensitivity: 'read',
  requiredPermission: 'campaign:read',
  inputSchema: z.object({ backendCampaignId: z.string().min(1) }),
  async execute(exec, input) {
    return { result: ok('confirmed', await exec.backend.getCampaignStatus(exec.ctx, input.backendCampaignId)) };
  },
});

const getCampaignReport = def({
  name: 'get_campaign_report',
  description: 'Gera o relatório de uma campanha finalizada ou em curso (spec §17, §18).',
  sensitivity: 'read',
  requiredPermission: 'report:read',
  inputSchema: z.object({ backendCampaignId: z.string().min(1) }),
  async execute(exec, input) {
    return { result: ok('confirmed', await exec.backend.getCampaignReport(exec.ctx, input.backendCampaignId)) };
  },
});

// ---------------------------------------------------------------------------
// Recarga / pagamento (spec §12 — financeiramente sensível)
// ---------------------------------------------------------------------------

const requestAccountRecharge = def({
  name: 'request_account_recharge',
  description:
    'Prepara (NÃO executa) uma recarga de saldo e devolve o resumo para confirmação (spec §12). Nunca cobra nada aqui.',
  sensitivity: 'prepare',
  requiredPermission: 'org:manage',
  inputSchema: z.object({ amount: z.number().positive() }),
  async execute(exec, input) {
    const prep = await exec.backend.prepareRecharge(exec.ctx, input.amount);
    if (!prep.supported) {
      return {
        result: fail(
          'A recarga automática por API não está disponível nesta conta; oriente o usuário a recarregar pelo painel/financeiro.',
          'RECHARGE_UNSUPPORTED',
        ),
      };
    }
    return { result: ok('planned', prep) };
  },
});

const executeAuthorizedRecharge = def({
  name: 'execute_authorized_recharge',
  description:
    'Executa a recarga APÓS confirmação explícita do usuário (spec §12). Requer confirm=true. Idempotente por referência.',
  sensitivity: 'sensitive',
  requiredPermission: 'org:manage',
  inputSchema: z.object({
    amount: z.number().positive(),
    confirm: z.literal(true).describe('Deve ser true e refletir a confirmação explícita do usuário.'),
    reference: z.string().min(1).describe('Referência única para idempotência (spec §23).'),
  }),
  async execute(exec, input) {
    const r = await exec.backend.executeRecharge(exec.ctx, input.amount, input.reference);
    await exec.backend.audit(exec.ctx, {
      action: 'ASSISTANT_RECHARGE_EXECUTED',
      metadata: { amount: input.amount, reference: input.reference, confirmed: r.confirmed },
    });
    if (!r.confirmed) return { result: fail('A recarga não foi confirmada pelo provedor.', 'RECHARGE_FAILED') };
    return { result: ok('confirmed', { newBalance: r.newBalance }) };
  },
});

export const TOOLS: ToolDefinition<never>[] = [
  getAccountBalance,
  listSenders,
  getSender,
  listTemplates,
  getTemplate,
  estimateCampaignCost,
  createCampaignDraft,
  selectSender,
  selectTemplate,
  attachContactList,
  mapTemplateVariables,
  setSchedule,
  generateCampaignPreview,
  requestCampaignApproval,
  approveCampaign,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  getCampaignStatus,
  getCampaignReport,
  requestAccountRecharge,
  executeAuthorizedRecharge,
] as unknown as ToolDefinition<never>[];

export const TOOLS_BY_NAME: Map<string, ToolDefinition<never>> = new Map(
  TOOLS.map((t) => [t.name, t]),
);
