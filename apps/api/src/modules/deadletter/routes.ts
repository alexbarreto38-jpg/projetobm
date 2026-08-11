import { QUEUE_NAMES } from '@wise/queue';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import type { Requeuers } from '../../queue/enqueuer.js';
import { DeadLetterService } from './deadletter.service.js';

interface OrgParams {
  id: string;
}
interface EntryParams {
  id: string;
  entryId: string;
}

export async function registerDeadLetterRoutes(app: FastifyInstance, config: AppConfig) {
  // Mapeia cada fila ao seu enfileirador disponível nesta instância.
  const requeuers: Requeuers = {
    [QUEUE_NAMES.webhookProcessing]: config.webhookEnqueuer?.enqueue.bind(config.webhookEnqueuer),
    [QUEUE_NAMES.metaTemplateDeployment]:
      config.templateDeploymentEnqueuer?.enqueue.bind(config.templateDeploymentEnqueuer),
    [QUEUE_NAMES.contactImport]:
      config.contactImportEnqueuer?.enqueue.bind(config.contactImportEnqueuer),
    [QUEUE_NAMES.campaignProcessing]:
      config.campaignProcessingEnqueuer?.enqueue.bind(config.campaignProcessingEnqueuer),
    [QUEUE_NAMES.messageSend]: config.messageSendEnqueuer?.enqueue.bind(config.messageSendEnqueuer),
  };
  const service = new DeadLetterService(config.prisma, requeuers);

  app.get<{ Params: OrgParams }>('/organizations/:id/dead-letters', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ deadLetters: await service.list(ctx, request.params.id) });
  });

  app.post<{ Params: EntryParams }>(
    '/organizations/:id/dead-letters/:entryId/requeue',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        entry: await service.requeue(ctx, request.params.id, request.params.entryId),
      });
    },
  );

  app.post<{ Params: EntryParams }>(
    '/organizations/:id/dead-letters/:entryId/dismiss',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        entry: await service.dismiss(ctx, request.params.id, request.params.entryId),
      });
    },
  );
}
