import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ContactImportEnqueuer } from '../queue/enqueuer.js';
import {
  extractSessionCookie,
  hasDb,
  makePrisma,
  resetDb,
  TEST_AUTH_SECRET,
} from './helpers.js';

class FakeImportEnqueuer implements ContactImportEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string): Promise<void> {
    this.ids.push(id);
  }
}

describe.skipIf(!hasDb)('contacts integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let enqueuer: FakeImportEnqueuer;

  beforeAll(async () => {
    enqueuer = new FakeImportEnqueuer();
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      contactImportEnqueuer: enqueuer,
    });
  });
  beforeEach(async () => {
    await resetDb(prisma);
    enqueuer.ids.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'a-strong-password', organizationName: 'Empresa' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;
    return { cookie, orgId };
  }

  const createContact = (cookie: string, orgId: string, phone: string) =>
    app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/contacts`,
      headers: { cookie },
      payload: { phone, name: 'Fulano' },
    });

  it('cria contato normalizando o telefone para E.164', async () => {
    const { cookie, orgId } = await setup('c1@x.com');
    const res = await createContact(cookie, orgId, '(11) 99000-0001');
    expect(res.statusCode).toBe(201);
    expect(res.json().contact.phone).toBe('+5511990000001');
  });

  it('deduplica por telefone normalizado (409 em formato diferente)', async () => {
    const { cookie, orgId } = await setup('c2@x.com');
    await createContact(cookie, orgId, '11990000001');
    const dup = await createContact(cookie, orgId, '+55 (11) 99000-0001');
    expect(dup.statusCode).toBe(409);
  });

  it('rejeita telefone inválido (400)', async () => {
    const { cookie, orgId } = await setup('c3@x.com');
    const res = await createContact(cookie, orgId, '123');
    expect(res.statusCode).toBe(400);
  });

  it('registra opt-in e opt-out; listagem reflete o estado', async () => {
    const { cookie, orgId } = await setup('c4@x.com');
    const contactId = (await createContact(cookie, orgId, '11990000002')).json().contact.id;

    const consent = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/contacts/${contactId}/consent`,
      headers: { cookie },
      payload: { consentType: 'MARKETING', source: 'site' },
    });
    expect(consent.statusCode).toBe(201);

    const optout = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/contacts/${contactId}/optout`,
      headers: { cookie },
      payload: { reason: 'pediu para sair' },
    });
    expect(optout.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/contacts`,
      headers: { cookie },
    });
    const contact = list.json().contacts[0];
    expect(contact.isOptedOut).toBe(true);
    expect(contact.consentTypes).toContain('MARKETING');
  });

  it('cria importação de CSV (202), enfileira e expõe status sem vazar o CSV', async () => {
    const { cookie, orgId } = await setup('c5@x.com');
    const csv = 'phone,name\n11990000003,Ana\n11990000004,Bruno\n';
    const res = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/contacts/import`,
      headers: { cookie },
      payload: { csv, filename: 'contatos.csv' },
    });
    expect(res.statusCode).toBe(202);
    const importId = res.json().import.id;
    expect(enqueuer.ids).toContain(importId);

    const status = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/contacts/imports/${importId}`,
      headers: { cookie },
    });
    expect(status.json().import.status).toBe('PENDING');
    expect(status.json().import.sourceText).toBeUndefined();
  });

  it('RBAC: VIEWER não pode criar contato (403)', async () => {
    const { cookie: ownerCookie, orgId } = await setup('c6@x.com');
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'v6c@x.com', password: 'a-strong-password', organizationName: 'Outra' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'v6c@x.com', role: 'VIEWER' },
    });
    const vlogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'v6c@x.com', password: 'a-strong-password' },
    });
    const vcookie = extractSessionCookie(vlogin.headers['set-cookie']);
    const res = await createContact(vcookie, orgId, '11990000009');
    expect(res.statusCode).toBe(403);
  });
});
