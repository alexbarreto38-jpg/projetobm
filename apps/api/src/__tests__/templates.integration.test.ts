import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { TemplateDeploymentEnqueuer } from '../queue/enqueuer.js';
import {
  extractSessionCookie,
  hasDb,
  makePrisma,
  resetDb,
  TEST_AUTH_SECRET,
} from './helpers.js';

class FakeDeploymentEnqueuer implements TemplateDeploymentEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string): Promise<void> {
    this.ids.push(id);
  }
}

const BODY = [{ type: 'BODY', text: 'Olá {{1}}, sua fatura venceu.' }];

describe.skipIf(!hasDb)('templates integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let enqueuer: FakeDeploymentEnqueuer;

  beforeAll(async () => {
    enqueuer = new FakeDeploymentEnqueuer();
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      templateDeploymentEnqueuer: enqueuer,
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

  async function setup(email: string, accountCount = 0) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'a-strong-password', organizationName: 'Empresa' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;

    const accountIds: string[] = [];
    if (accountCount > 0) {
      const conn = await prisma.metaConnection.create({
        data: { organizationId: orgId, provider: 'meta', status: 'CONNECTED' },
      });
      for (let i = 0; i < accountCount; i += 1) {
        const acc = await prisma.whatsAppAccount.create({
          data: {
            organizationId: orgId,
            metaConnectionId: conn.id,
            externalAccountId: `WABA_${i}_${conn.id}`,
            accountModel: 'LEGACY',
            name: `Conta ${i}`,
          },
        });
        accountIds.push(acc.id);
      }
    }
    return { cookie, orgId, accountIds };
  }

  const createTemplate = (cookie: string, orgId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/templates`,
      headers: { cookie },
      payload: { name: 'cobranca_v1', language: 'pt_BR', category: 'UTILITY', components: BODY },
    });

  it('cria template em rascunho e lista com resumo de implantações', async () => {
    const { cookie, orgId } = await setup('t1@x.com');
    const create = await createTemplate(cookie, orgId);
    expect(create.statusCode).toBe(201);
    expect(create.json().template.status).toBe('DRAFT');

    const list = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/templates`,
      headers: { cookie },
    });
    expect(list.json().templates).toHaveLength(1);
    expect(list.json().templates[0].deploymentSummary).toEqual({});
  });

  it('recusa nome+idioma duplicados (409)', async () => {
    const { cookie, orgId } = await setup('t2@x.com');
    await createTemplate(cookie, orgId);
    const dup = await createTemplate(cookie, orgId);
    expect(dup.statusCode).toBe(409);
  });

  it('replica em N contas: cria 1 deployment por conta (QUEUED) e enfileira 1 job cada', async () => {
    const { cookie, orgId, accountIds } = await setup('t3@x.com', 3);
    const tpl = (await createTemplate(cookie, orgId)).json().template;

    const rep = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/templates/${tpl.id}/replicate`,
      headers: { cookie },
      payload: { targetAccountIds: accountIds },
    });
    expect(rep.statusCode).toBe(202);
    const deployments = rep.json().deployments;
    expect(deployments).toHaveLength(3);
    expect(deployments.every((d: { status: string }) => d.status === 'QUEUED')).toBe(true);
    expect(enqueuer.ids).toHaveLength(3);
  });

  it('replicação é idempotente: repetir não duplica deployment nem reenfileira', async () => {
    const { cookie, orgId, accountIds } = await setup('t4@x.com', 2);
    const tpl = (await createTemplate(cookie, orgId)).json().template;
    const replicate = () =>
      app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/templates/${tpl.id}/replicate`,
        headers: { cookie },
        payload: { targetAccountIds: accountIds },
      });
    await replicate();
    await replicate();

    const deps = await prisma.templateDeployment.findMany({ where: { templateId: tpl.id } });
    expect(deps).toHaveLength(2);
    expect(enqueuer.ids).toHaveLength(2); // segunda chamada não reenfileira QUEUED
  });

  it('recusa replicar em conta de outra organização (400)', async () => {
    const { cookie, orgId } = await setup('t5@x.com');
    const other = await setup('t5b@x.com', 1);
    const tpl = (await createTemplate(cookie, orgId)).json().template;

    const rep = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/templates/${tpl.id}/replicate`,
      headers: { cookie },
      payload: { targetAccountIds: other.accountIds },
    });
    expect(rep.statusCode).toBe(400);
  });

  it('RBAC: VIEWER não pode criar template (403)', async () => {
    const { cookie: ownerCookie, orgId } = await setup('t6@x.com');
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'v6@x.com', password: 'a-strong-password', organizationName: 'Outra' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'v6@x.com', role: 'VIEWER' },
    });
    const vlogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'v6@x.com', password: 'a-strong-password' },
    });
    const vcookie = extractSessionCookie(vlogin.headers['set-cookie']);
    const res = await createTemplate(vcookie, orgId);
    expect(res.statusCode).toBe(403);
  });
});
