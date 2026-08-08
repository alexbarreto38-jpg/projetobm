import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { OrganizationService } from './service.js';

interface OrgParams {
  id: string;
}
interface MemberParams {
  id: string;
  membershipId: string;
}

export async function registerOrganizationRoutes(app: FastifyInstance, config: AppConfig) {
  const service = new OrganizationService(config.prisma);

  app.get('/organizations', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ organizations: await service.list(ctx) });
  });

  app.post('/organizations', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = createOrganizationSchema.parse(request.body);
    return reply.status(201).send({ organization: await service.create(ctx, input) });
  });

  app.get<{ Params: OrgParams }>('/organizations/:id', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ organization: await service.get(ctx, request.params.id) });
  });

  app.patch<{ Params: OrgParams }>('/organizations/:id', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = updateOrganizationSchema.parse(request.body);
    return reply.send({ organization: await service.update(ctx, request.params.id, input) });
  });

  // --- membros -------------------------------------------------------------

  app.get<{ Params: OrgParams }>('/organizations/:id/members', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ members: await service.listMembers(ctx, request.params.id) });
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/members', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = inviteMemberSchema.parse(request.body);
    return reply
      .status(201)
      .send({ member: await service.inviteMember(ctx, request.params.id, input) });
  });

  app.patch<{ Params: MemberParams }>(
    '/organizations/:id/members/:membershipId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = updateMemberRoleSchema.parse(request.body);
      return reply.send({
        member: await service.updateMemberRole(
          ctx,
          request.params.id,
          request.params.membershipId,
          input,
        ),
      });
    },
  );

  app.delete<{ Params: MemberParams }>(
    '/organizations/:id/members/:membershipId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      await service.removeMember(ctx, request.params.id, request.params.membershipId);
      return reply.status(204).send();
    },
  );
}
