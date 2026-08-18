import { can as canPermission, type AuthContext } from '@wise/auth';
import { ingestDeliveryReports, type InfobipDeliveryReport } from '@wise/infobip-provider';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../app.js';
import { badRequest } from '../../lib/errors.js';
import { AssistantService } from './service.js';

interface OrgParams {
  id: string;
}

const messageSchema = z.object({
  /** Texto do usuário. Se veio de áudio, já deve estar transcrito (spec §3). */
  text: z.string().min(1).max(4000),
});

const listSchema = z.object({
  ref: z.string().min(1).max(200),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.record(z.string())).min(1).max(200000),
});

/**
 * Rotas do assistente conversacional (spec §1, §2). Registradas apenas quando um
 * LlmClient está configurado (ANTHROPIC_API_KEY). O backend das ferramentas é
 * Meta por padrão, ou Infobip quando `config.infobipAssistant` está presente.
 */
export async function registerAssistantRoutes(app: FastifyInstance, config: AppConfig) {
  if (!config.assistantLlm) return;
  const service = new AssistantService({
    prisma: config.prisma,
    llm: config.assistantLlm,
    backend: config.infobipAssistant?.backend,
    allocateCampaignId: config.infobipAssistant?.allocateCampaignId,
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/assistant/messages', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('Mensagem inválida.');
    const result = await service.handleMessage(ctx, request.params.id, parsed.data.text);
    return reply.send(result);
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/assistant/reset', async (request, reply) => {
    const ctx = app.requireAuth(request);
    await service.reset(request.params.id, ctx.userId);
    return reply.send({ ok: true });
  });

  // Ingestão de lista para o provider Infobip (spec §6). O canal WhatsApp/painel
  // faz o parse do CSV/XLSX e envia as linhas; a validação ocorre depois, via
  // ferramenta attach_contact_list (spec §7).
  if (config.infobipAssistant) {
    const lists = config.infobipAssistant.lists;
    app.post<{ Params: OrgParams }>('/organizations/:id/assistant/lists', async (request, reply) => {
      const ctx = app.requireAuth(request);
      // Importar lista exige a mesma permissão de escrita de contatos (spec §19).
      if (!can(ctx, request.params.id)) throw badRequest('Sem permissão para importar listas.');
      const parsed = listSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest('Lista inválida.');
      await lists.set(parsed.data.ref, { columns: parsed.data.columns, rows: parsed.data.rows });
      return reply.status(201).send({ ref: parsed.data.ref, rows: parsed.data.rows.length });
    });
  }
}

/**
 * Webhook de relatórios de entrega do Infobip (spec §16, §31). Fica FORA do
 * contexto autenticado — quem chama é o Infobip. Proteja por token no header
 * (INFOBIP_WEBHOOK_TOKEN) e/ou por IP allowlist na rede.
 */
export async function registerAssistantWebhookRoutes(app: FastifyInstance, config: AppConfig) {
  if (!config.infobipAssistant) return;
  const campaigns = config.infobipAssistant.campaigns;
  const token = config.infobipWebhookToken;

  app.post('/webhooks/infobip/delivery', async (request, reply) => {
    if (token) {
      const provided = request.headers['x-infobip-token'];
      if (provided !== token) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    const body = request.body as { results?: InfobipDeliveryReport[] } | undefined;
    const results = body?.results ?? [];
    await ingestDeliveryReports(campaigns, results);
    return reply.send({ received: results.length });
  });
}

// Permissão de escrita de contatos, sem acoplar ao módulo de contatos (spec §19).
function can(ctx: AuthContext, organizationId: string): boolean {
  return canPermission(ctx, organizationId, 'contact:write');
}
