import { paginationSchema } from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { AuditService } from './audit.service.js';

interface OrgParams {
  id: string;
}

export async function registerAuditRoutes(app: FastifyInstance, config: AppConfig) {
  const service = new AuditService(config.prisma);

  app.get<{ Params: OrgParams }>('/organizations/:id/audit', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const { limit, cursor } = paginationSchema.parse(request.query);
    return reply.send(await service.list(ctx, request.params.id, limit, cursor));
  });
}
