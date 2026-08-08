import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import type { MetaContext } from '../../meta/context.js';
import { WebhookIngestService } from './service.js';

interface HandshakeQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

/**
 * Rotas de webhook Meta (spec §30). PÚBLICAS (a Meta as chama); a autenticação
 * é a assinatura da requisição, não a sessão do painel.
 *
 * Registradas em seu próprio escopo com um content-type parser que preserva o
 * corpo BRUTO (necessário para validar X-Hub-Signature-256).
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  config: AppConfig,
  meta: MetaContext,
) {
  const service = new WebhookIngestService(config.prisma, meta, config.webhookEnqueuer);

  // Parser que mantém o Buffer bruto e também o JSON parseado.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Handshake de verificação.
  app.get<{ Querystring: HandshakeQuery }>('/whatsapp', async (request, reply) => {
    const challenge = service.verifyChallenge(
      request.query['hub.mode'],
      request.query['hub.verify_token'],
      request.query['hub.challenge'],
    );
    if (challenge === null) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Token inválido.' } });
    }
    return reply.status(200).type('text/plain').send(challenge);
  });

  // Recebimento de eventos.
  app.post('/whatsapp', async (request, reply) => {
    const rawBody = request.body as Buffer;
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const result = await service.ingest(rawBody, signature);
    // Responde rápido; o processamento acontece no worker (spec §30).
    return reply.status(200).send({ status: 'ok', deduped: result.deduped });
  });
}
