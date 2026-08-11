import { createCampaignSchema, startCampaignSchema } from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { CampaignService } from './campaign.service.js';

interface OrgParams {
  id: string;
}
interface CampaignParams {
  id: string;
  campaignId: string;
}

export async function registerCampaignRoutes(app: FastifyInstance, config: AppConfig) {
  const service = new CampaignService(config.prisma, config.campaignProcessingEnqueuer);

  app.get<{ Params: OrgParams }>('/organizations/:id/campaigns', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ campaigns: await service.list(ctx, request.params.id) });
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/campaigns', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = createCampaignSchema.parse(request.body);
    return reply.status(201).send({ campaign: await service.create(ctx, request.params.id, input) });
  });

  app.get<{ Params: CampaignParams }>(
    '/organizations/:id/campaigns/:campaignId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        campaign: await service.get(ctx, request.params.id, request.params.campaignId),
      });
    },
  );

  app.get<{ Params: CampaignParams }>(
    '/organizations/:id/campaigns/:campaignId/preflight',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        preflight: await service.runPreflight(ctx, request.params.id, request.params.campaignId),
      });
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/organizations/:id/campaigns/:campaignId/start',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = startCampaignSchema.parse(request.body ?? {});
      const result = await service.start(
        ctx,
        request.params.id,
        request.params.campaignId,
        input.acknowledgeWarnings,
      );
      return reply.send(result);
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/organizations/:id/campaigns/:campaignId/pause',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        campaign: await service.pause(ctx, request.params.id, request.params.campaignId),
      });
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/organizations/:id/campaigns/:campaignId/cancel',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        campaign: await service.cancel(ctx, request.params.id, request.params.campaignId),
      });
    },
  );
}
