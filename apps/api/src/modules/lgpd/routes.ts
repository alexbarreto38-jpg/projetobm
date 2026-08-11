import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { LgpdService } from './lgpd.service.js';

interface OrgParams {
  id: string;
}

const deleteSchema = z.object({ confirmSlug: z.string().min(1) });
const purgeSchema = z.object({ olderThanDays: z.number().int().min(1).max(3650) });

export async function registerLgpdRoutes(app: FastifyInstance, config: AppConfig) {
  const service = new LgpdService(config.prisma);

  app.get<{ Params: OrgParams }>('/organizations/:id/data-export', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send(await service.exportData(ctx, request.params.id));
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/data-purge', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const { olderThanDays } = purgeSchema.parse(request.body);
    return reply.send(await service.purgeOldData(ctx, request.params.id, olderThanDays));
  });

  app.delete<{ Params: OrgParams }>('/organizations/:id/data', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const { confirmSlug } = deleteSchema.parse(request.body);
    return reply.send(await service.deleteOrganization(ctx, request.params.id, confirmSlug));
  });
}
