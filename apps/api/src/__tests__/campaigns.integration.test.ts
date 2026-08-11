import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { CampaignProcessingEnqueuer } from '../queue/enqueuer.js';
import {
  extractSessionCookie,
  hasDb,
  makePrisma,
  resetDb,
  TEST_AUTH_SECRET,
} from './helpers.js';

class FakeCampaignEnqueuer implements CampaignProcessingEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string): Promise<void> {
    this.ids.push(id);
  }
}

describe.skipIf(!hasDb)('campaigns integration', () => {
  const prisma: PrismaClient = makePrisma();
  let app: FastifyInstance;
  let enqueuer: FakeCampaignEnqueuer;

  beforeAll(async () => {
    enqueuer = new FakeCampaignEnqueuer();
    app = await buildApp({
      prisma,
      authSecret: TEST_AUTH_SECRET,
      secureCookies: false,
      enableRateLimit: false,
      campaignProcessingEnqueuer: enqueuer,
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

  /** Cria o encadeamento completo: org, conta conectada, número, template. */
  async function setup(email: string, opts: { approved?: boolean; contacts?: number } = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'a-strong-password', organizationName: 'Empresa' },
    });
    const cookie = extractSessionCookie(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const orgId = Object.keys(me.json().user.memberships)[0]!;

    const credential = await prisma.credential.create({
      data: { organizationId: orgId, provider: 'meta', encryptedToken: 'enc', status: 'ACTIVE' },
    });
    const connection = await prisma.metaConnection.create({
      data: { organizationId: orgId, provider: 'meta', status: 'CONNECTED', credentialId: credential.id },
    });
    const account = await prisma.whatsAppAccount.create({
      data: {
        organizationId: orgId,
        metaConnectionId: connection.id,
        externalAccountId: `WABA_${connection.id}`,
        accountModel: 'LEGACY',
        name: 'Conta 1',
      },
    });
    await prisma.phoneNumber.create({
      data: {
        organizationId: orgId,
        whatsappAccountId: account.id,
        externalPhoneNumberId: `PN_${account.id}`,
        displayPhoneNumber: '+5511990000000',
        isPaused: false,
      },
    });
    const template = await prisma.template.create({
      data: {
        organizationId: orgId,
        name: 'aviso_v1',
        language: 'pt_BR',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Olá' }],
      },
    });
    if (opts.approved) {
      await prisma.templateDeployment.create({
        data: {
          organizationId: orgId,
          templateId: template.id,
          targetAccountId: account.id,
          externalTemplateId: 'TPL_1',
          status: 'APPROVED',
          idempotencyKey: `tpl_${template.id}_acc_${account.id}`,
        },
      });
    }
    for (let i = 0; i < (opts.contacts ?? 0); i += 1) {
      await prisma.contact.create({
        data: { organizationId: orgId, phone: `+55119900000${i}${i}` },
      });
    }
    return { cookie, orgId, accountId: account.id, templateId: template.id };
  }

  const createCampaign = (cookie: string, orgId: string, templateId: string, accountId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/campaigns`,
      headers: { cookie },
      payload: { name: 'Campanha 1', templateId, accountIds: [accountId] },
    });

  it('cria campanha (DRAFT) com alvos', async () => {
    const { cookie, orgId, templateId, accountId } = await setup('cp1@x.com');
    const res = await createCampaign(cookie, orgId, templateId, accountId);
    expect(res.statusCode).toBe(201);
    expect(res.json().campaign.status).toBe('DRAFT');
  });

  it('preflight READY quando há conta, número, template aprovado e público', async () => {
    const { cookie, orgId, templateId, accountId } = await setup('cp2@x.com', {
      approved: true,
      contacts: 2,
    });
    const campaignId = (await createCampaign(cookie, orgId, templateId, accountId)).json().campaign.id;

    const pf = await app.inject({
      method: 'GET',
      url: `/api/organizations/${orgId}/campaigns/${campaignId}/preflight`,
      headers: { cookie },
    });
    expect(pf.json().preflight.result).toBe('READY');
    expect(pf.json().preflight.audience.eligible).toBe(2);
  });

  it('start com preflight READY → RUNNING e enfileira processamento', async () => {
    const { cookie, orgId, templateId, accountId } = await setup('cp3@x.com', {
      approved: true,
      contacts: 1,
    });
    const campaignId = (await createCampaign(cookie, orgId, templateId, accountId)).json().campaign.id;

    const start = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/campaigns/${campaignId}/start`,
      headers: { cookie },
      payload: {},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().campaign.status).toBe('RUNNING');
    expect(enqueuer.ids).toContain(campaignId);
  });

  it('start BLOQUEADO quando não há template aprovado (422)', async () => {
    const { cookie, orgId, templateId, accountId } = await setup('cp4@x.com', {
      approved: false,
      contacts: 1,
    });
    const campaignId = (await createCampaign(cookie, orgId, templateId, accountId)).json().campaign.id;

    const start = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/campaigns/${campaignId}/start`,
      headers: { cookie },
      payload: {},
    });
    expect(start.statusCode).toBe(422);
    expect(start.json().error.code).toBe('PREFLIGHT_BLOCKED');
    expect(enqueuer.ids).not.toContain(campaignId);
  });

  it('cancela campanha em rascunho (CANCELLED)', async () => {
    const { cookie, orgId, templateId, accountId } = await setup('cp5@x.com', { approved: true });
    const campaignId = (await createCampaign(cookie, orgId, templateId, accountId)).json().campaign.id;
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/campaigns/${campaignId}/cancel`,
      headers: { cookie },
    });
    expect(cancel.json().campaign.status).toBe('CANCELLED');
  });

  it('RBAC: VIEWER não pode criar campanha (403)', async () => {
    const { cookie: ownerCookie, orgId, templateId, accountId } = await setup('cp6@x.com');
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'vcp@x.com', password: 'a-strong-password', organizationName: 'Outra' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie: ownerCookie },
      payload: { email: 'vcp@x.com', role: 'VIEWER' },
    });
    const vlogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'vcp@x.com', password: 'a-strong-password' },
    });
    const vcookie = extractSessionCookie(vlogin.headers['set-cookie']);
    const res = await createCampaign(vcookie, orgId, templateId, accountId);
    expect(res.statusCode).toBe(403);
  });
});
