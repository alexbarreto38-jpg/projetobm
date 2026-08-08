import {
  createTemplateSchema,
  duplicateTemplateSchema,
  replicateTemplateSchema,
  updateTemplateSchema,
} from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { TemplateDeploymentService } from './deployment.service.js';
import { TemplateService } from './template.service.js';

interface OrgParams {
  id: string;
}
interface TemplateParams {
  id: string;
  templateId: string;
}

export async function registerTemplateRoutes(app: FastifyInstance, config: AppConfig) {
  const templates = new TemplateService(config.prisma);
  const deployments = new TemplateDeploymentService(
    config.prisma,
    config.templateDeploymentEnqueuer,
  );

  app.get<{ Params: OrgParams }>('/organizations/:id/templates', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ templates: await templates.list(ctx, request.params.id) });
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/templates', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = createTemplateSchema.parse(request.body);
    return reply.status(201).send({ template: await templates.create(ctx, request.params.id, input) });
  });

  app.get<{ Params: TemplateParams }>(
    '/organizations/:id/templates/:templateId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        template: await templates.get(ctx, request.params.id, request.params.templateId),
      });
    },
  );

  app.patch<{ Params: TemplateParams }>(
    '/organizations/:id/templates/:templateId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = updateTemplateSchema.parse(request.body);
      return reply.send({
        template: await templates.update(
          ctx,
          request.params.id,
          request.params.templateId,
          input,
        ),
      });
    },
  );

  app.post<{ Params: TemplateParams }>(
    '/organizations/:id/templates/:templateId/duplicate',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = duplicateTemplateSchema.parse(request.body);
      return reply.status(201).send({
        template: await templates.duplicate(
          ctx,
          request.params.id,
          request.params.templateId,
          input,
        ),
      });
    },
  );

  // Bulk Template Manager (spec §17, §52): replica em N contas.
  app.post<{ Params: TemplateParams }>(
    '/organizations/:id/templates/:templateId/replicate',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = replicateTemplateSchema.parse(request.body);
      const result = await deployments.replicate(
        ctx,
        request.params.id,
        request.params.templateId,
        input.targetAccountIds,
      );
      return reply.status(202).send({ deployments: result.map(serializeDeployment) });
    },
  );

  app.get<{ Params: TemplateParams }>(
    '/organizations/:id/templates/:templateId/deployments',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const result = await deployments.listByTemplate(
        ctx,
        request.params.id,
        request.params.templateId,
      );
      return reply.send({ deployments: result });
    },
  );
}

function serializeDeployment(d: {
  id: string;
  targetAccountId: string;
  status: string;
  externalTemplateId: string | null;
}) {
  return {
    id: d.id,
    targetAccountId: d.targetAccountId,
    status: d.status,
    externalTemplateId: d.externalTemplateId,
  };
}
