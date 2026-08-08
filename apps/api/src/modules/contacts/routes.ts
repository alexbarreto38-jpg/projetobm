import {
  createContactSchema,
  importContactsSchema,
  optoutSchema,
  paginationSchema,
  recordConsentSchema,
} from '@wise/validation';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { ContactService } from './contact.service.js';
import { ContactImportService } from './import.service.js';

interface OrgParams {
  id: string;
}
interface ContactParams {
  id: string;
  contactId: string;
}
interface ImportParams {
  id: string;
  importId: string;
}

export async function registerContactRoutes(app: FastifyInstance, config: AppConfig) {
  const contacts = new ContactService(config.prisma);
  const imports = new ContactImportService(config.prisma, config.contactImportEnqueuer);

  app.get<{ Params: OrgParams }>('/organizations/:id/contacts', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const { limit, cursor } = paginationSchema.parse(request.query);
    return reply.send(await contacts.list(ctx, request.params.id, limit, cursor));
  });

  app.post<{ Params: OrgParams }>('/organizations/:id/contacts', async (request, reply) => {
    const ctx = app.requireAuth(request);
    const input = createContactSchema.parse(request.body);
    return reply.status(201).send({ contact: await contacts.create(ctx, request.params.id, input) });
  });

  app.post<{ Params: ContactParams }>(
    '/organizations/:id/contacts/:contactId/consent',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = recordConsentSchema.parse(request.body);
      return reply.status(201).send({
        consent: await contacts.recordConsent(ctx, request.params.id, request.params.contactId, input),
      });
    },
  );

  app.post<{ Params: ContactParams }>(
    '/organizations/:id/contacts/:contactId/optout',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = optoutSchema.parse(request.body);
      return reply.status(201).send({
        optout: await contacts.optOut(ctx, request.params.id, request.params.contactId, input),
      });
    },
  );

  app.delete<{ Params: ContactParams }>(
    '/organizations/:id/contacts/:contactId/optout',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      await contacts.removeOptOut(ctx, request.params.id, request.params.contactId);
      return reply.status(204).send();
    },
  );

  // Importação de CSV (spec §40) — processada em background.
  app.post<{ Params: OrgParams }>(
    '/organizations/:id/contacts/import',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      const input = importContactsSchema.parse(request.body);
      const record = await imports.createImport(ctx, request.params.id, input);
      return reply.status(202).send({ import: { id: record.id, status: record.status } });
    },
  );

  app.get<{ Params: ImportParams }>(
    '/organizations/:id/contacts/imports/:importId',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({ import: await imports.getImport(ctx, request.params.id, request.params.importId) });
    },
  );
}
