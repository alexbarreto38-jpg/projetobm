import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  AuthorizationError,
  SESSION_COOKIE,
  verifySessionToken,
  type AuthContext,
} from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { MetaApiError, type MetaErrorCategory } from '@wise/meta-provider';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { buildAuthContext } from './context.js';
import { AppError, unauthorized } from './lib/errors.js';
import type { MetaContext } from './meta/context.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerMetaRoutes } from './modules/meta/routes.js';
import { registerCampaignRoutes } from './modules/campaigns/routes.js';
import { registerContactRoutes } from './modules/contacts/routes.js';
import { registerDeadLetterRoutes } from './modules/deadletter/routes.js';
import { registerOrganizationRoutes } from './modules/organizations/routes.js';
import { registerReportRoutes } from './modules/reports/routes.js';
import { registerTemplateRoutes } from './modules/templates/routes.js';
import { registerWebhookRoutes } from './modules/webhooks/routes.js';
import type {
  CampaignProcessingEnqueuer,
  ContactImportEnqueuer,
  MessageSendEnqueuer,
  TemplateDeploymentEnqueuer,
  WebhookEnqueuer,
} from './queue/enqueuer.js';

export interface AppConfig {
  prisma: PrismaClient;
  authSecret: string;
  /** cookies Secure exigem HTTPS; desligar apenas em dev/test local. */
  secureCookies?: boolean;
  /** desabilita rate limit em testes. */
  enableRateLimit?: boolean;
  /**
   * Contexto Meta (provider + vault). Quando ausente, as rotas /meta não são
   * registradas — permite subir a API sem credenciais Meta na Fase 1.
   */
  meta?: MetaContext;
  /** Enfileirador de webhooks (BullMQ em prod, fake em testes). */
  webhookEnqueuer?: WebhookEnqueuer;
  /** Enfileirador de submissões de template. */
  templateDeploymentEnqueuer?: TemplateDeploymentEnqueuer;
  /** Enfileirador de importações de contatos. */
  contactImportEnqueuer?: ContactImportEnqueuer;
  /** Enfileirador de processamento de campanhas. */
  campaignProcessingEnqueuer?: CampaignProcessingEnqueuer;
  /** Enfileirador de envio de mensagens (usado no requeue da dead-letter). */
  messageSendEnqueuer?: MessageSendEnqueuer;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    // Necessário para validar a assinatura do webhook Meta sobre o corpo bruto
    // (spec §30) nas fases seguintes.
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: config.authSecret });
  if (config.enableRateLimit !== false) {
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  }

  // Resolve o AuthContext a partir do cookie de sessão (spec §10).
  app.decorateRequest('auth', undefined);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const payload = await verifySessionToken(token, { secret: config.authSecret });
    if (!payload) return;
    const ctx = await buildAuthContext(config.prisma, payload.sub);
    if (ctx) request.auth = ctx;
  });

  // Guard reutilizável: exige sessão válida.
  app.decorate('requireAuth', (request: FastifyRequest): AuthContext => {
    if (!request.auth) throw unauthorized();
    return request.auth;
  });

  // O error handler precisa ser registrado ANTES das rotas encapsuladas para
  // ser herdado pelo contexto filho criado por `app.register` (Fastify captura
  // o handler do contexto no momento da criação do filho).
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', issues: error.issues },
      });
    }
    if (error instanceof AuthorizationError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: 'FORBIDDEN', message: error.message } });
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error instanceof MetaApiError) {
      // Preserva os campos oficiais da Meta para suporte (spec §49) sem vazar
      // stack; mensagem amigável ao usuário (spec §48).
      request.log.error(error.toLogObject());
      return reply.status(metaStatus(error.category)).send({
        error: {
          code: 'META_API_ERROR',
          message: error.toUserMessage(),
          meta: {
            category: error.category,
            code: error.metaErrorCode,
            subcode: error.metaErrorSubcode,
            fbtrace_id: error.fbtraceId,
            retryable: error.retryable,
          },
        },
      });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições.' } });
    }
    // Erro inesperado: nunca vazar stack ao cliente (spec §48).
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Erro interno.' } });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (instance) => {
      await registerAuthRoutes(instance, config);
      await registerOrganizationRoutes(instance, config);
      await registerTemplateRoutes(instance, config);
      await registerContactRoutes(instance, config);
      await registerCampaignRoutes(instance, config);
      await registerReportRoutes(instance, config);
      await registerDeadLetterRoutes(instance, config);
      if (config.meta) {
        await registerMetaRoutes(instance, config, config.meta);
      }
    },
    { prefix: '/api' },
  );

  // Webhooks em escopo próprio: usa content-type parser de corpo bruto, isolado
  // do parser JSON das demais rotas. Registrado após o error handler.
  if (config.meta) {
    const meta = config.meta;
    await app.register(
      async (instance) => {
        await registerWebhookRoutes(instance, config, meta);
      },
      { prefix: '/api/webhooks/meta' },
    );
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth(request: FastifyRequest): AuthContext;
  }
}

/** Mapeia a categoria do erro Meta para um status HTTP adequado. */
function metaStatus(category: MetaErrorCategory): number {
  switch (category) {
    case 'AUTH':
      return 401;
    case 'PERMISSION':
      return 403;
    case 'VALIDATION':
      return 400;
    case 'RATE_LIMIT':
      return 429;
    case 'ACCOUNT_STATE':
      return 409;
    case 'TRANSIENT':
      return 503;
    default:
      return 502;
  }
}
