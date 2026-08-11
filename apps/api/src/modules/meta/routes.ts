import {
  connectByTokenSchema,
  embeddedSignupCallbackSchema,
} from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import type { MetaContext } from '../../meta/context.js';
import { MetaConnectionService } from './connection.service.js';

interface OrgParams {
  id: string;
}
interface AccountParams {
  id: string;
  accountId: string;
}
interface ConnectionParams {
  id: string;
  connectionId: string;
}

export async function registerMetaRoutes(
  app: FastifyInstance,
  config: AppConfig,
  meta: MetaContext,
) {
  const service = new MetaConnectionService(config.prisma, meta);

  // Config pública do Embedded Signup para o frontend (sem segredos — spec §46).
  app.get('/meta/embedded-signup/config', async (request, reply) => {
    app.requireAuth(request);
    return reply.send({
      appId: meta.appId,
      configId: meta.configId ?? null,
      graphVersion: meta.graphVersion,
    });
  });

  // Callback do Embedded Signup (spec §7): troca code por token e conecta.
  app.post<{ Params: OrgParams }>(
    '/organizations/:id/meta/connections/embedded-signup',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = embeddedSignupCallbackSchema.parse(request.body);
      const result = await service.connectFromCode({
        ctx,
        organizationId: request.params.id,
        code: input.code,
        wabaId: input.wabaId,
        redirectUri: input.redirectUri,
        requestId: request.id,
      });
      return reply.status(201).send(serializeConnection(result));
    },
  );

  // Conexão por token (System User) — uso administrativo (spec §7).
  app.post<{ Params: OrgParams }>(
    '/organizations/:id/meta/connections/token',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = connectByTokenSchema.parse(request.body);
      const result = await service.connect({
        ctx,
        organizationId: request.params.id,
        accessToken: input.accessToken,
        wabaId: input.wabaId,
        requestId: request.id,
      });
      return reply.status(201).send(serializeConnection(result));
    },
  );

  app.get<{ Params: OrgParams }>(
    '/organizations/:id/meta/accounts',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({ accounts: await service.listAccounts(ctx, request.params.id) });
    },
  );

  app.post<{ Params: AccountParams }>(
    '/organizations/:id/meta/accounts/:accountId/sync',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const result = await service.syncAccount(ctx, request.params.id, request.params.accountId);
      return reply.send(serializeConnection(result));
    },
  );

  app.delete<{ Params: ConnectionParams }>(
    '/organizations/:id/meta/connections/:connectionId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      await service.disconnect(ctx, request.params.id, request.params.connectionId);
      return reply.status(204).send();
    },
  );
}

function serializeConnection(result: Awaited<ReturnType<MetaConnectionService['connect']>>) {
  return {
    connection: {
      id: result.connection.id,
      status: result.connection.status,
      lastSyncAt: result.connection.lastSyncAt,
    },
    account: {
      id: result.account.id,
      externalAccountId: result.account.externalAccountId,
      accountModel: result.account.accountModel,
      name: result.account.name,
      currency: result.account.currency,
      timezone: result.account.timezone,
    },
    phoneNumbers: result.phoneNumbers.map((n) => ({
      id: n.id,
      externalPhoneNumberId: n.externalPhoneNumberId,
      displayPhoneNumber: n.displayPhoneNumber,
      qualityStatus: n.qualityStatus,
      isPaused: n.isPaused,
    })),
    health: result.health,
  };
}
