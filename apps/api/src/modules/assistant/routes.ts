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

/**
 * Rotas do assistente conversacional (spec §1, §2). O canal WhatsApp entra por
 * aqui após transcrever o áudio e extrair o texto; o painel também pode usar a
 * mesma rota para conversar com o assistente.
 *
 * Só é registrada quando um LlmClient está configurado (ANTHROPIC_API_KEY) —
 * sem LLM, não há assistente (spec §25).
 */
export async function registerAssistantRoutes(app: FastifyInstance, config: AppConfig) {
  if (!config.assistantLlm) return;
  const service = new AssistantService({ prisma: config.prisma, llm: config.assistantLlm });

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
}
