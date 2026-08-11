import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@wise/auth';
import { loginSchema, signupSchema } from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { AuthService } from './service.js';

export async function registerAuthRoutes(app: FastifyInstance, config: AppConfig) {
  const service = new AuthService(config.prisma);
  const secure = config.secureCookies ?? true;

  // Limite mais estrito nas rotas de credencial (anti brute-force — spec §47).
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/signup', authLimit, async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const payload = await service.register(input);
    const token = await createSessionToken(payload, { secret: config.authSecret });
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(undefined, secure));
    return reply.status(201).send({ user: { id: payload.sub, email: payload.email } });
  });

  app.post('/auth/login', authLimit, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const payload = await service.login(input);
    const token = await createSessionToken(payload, { secret: config.authSecret });
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(undefined, secure));
    return reply.send({ user: { id: payload.sub, email: payload.email } });
  });

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({
      user: {
        id: ctx.userId,
        email: ctx.email,
        isSuperAdmin: ctx.isSuperAdmin,
        memberships: ctx.memberships,
      },
    });
  });
}
