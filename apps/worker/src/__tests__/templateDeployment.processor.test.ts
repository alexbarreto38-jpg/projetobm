import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { CredentialVault, MetaMockServer, MetaProvider } from '@wise/meta-provider';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkerMeta } from '../meta.js';
import { processTemplateDeployment } from '../processors/templateDeployment.js';
import { processWebhookEvent } from '../processors/webhook.js';
import { hasDb, makePrisma, resetDb, seedAccount } from './helpers.js';

function makeMeta(server: MetaMockServer): { meta: WorkerMeta; vault: CredentialVault } {
  const vault = new CredentialVault([{ version: 1, key: randomBytes(32) }]);
  const provider = new MetaProvider({
    baseUrl: 'https://graph.facebook.com',
    version: 'v23.0',
    appId: 'APP',
    appSecret: 'SECRET',
    fetchImpl: server.fetch,
  });
  return { meta: { provider, vault }, vault };
}

describe.skipIf(!hasDb)('processTemplateDeployment', () => {
  const prisma: PrismaClient = makePrisma();

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedDeployment(vault: CredentialVault) {
    const { org, connection, account } = await seedAccount(prisma);
    const credential = await prisma.credential.create({
      data: {
        organizationId: org.id,
        provider: 'meta',
        encryptedToken: vault.encrypt('SYS_TOKEN'),
        keyVersion: 1,
        status: 'ACTIVE',
      },
    });
    await prisma.metaConnection.update({
      where: { id: connection.id },
      data: { credentialId: credential.id },
    });
    const template = await prisma.template.create({
      data: {
        organizationId: org.id,
        name: 'cobranca_v1',
        language: 'pt_BR',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Olá' }],
      },
    });
    const deployment = await prisma.templateDeployment.create({
      data: {
        organizationId: org.id,
        templateId: template.id,
        targetAccountId: account.id,
        status: 'QUEUED',
        idempotencyKey: `tpl_${template.id}_acc_${account.id}`,
      },
    });
    return { org, account, template, deployment };
  }

  it('submete o template à Meta e grava externalTemplateId + status PENDING', async () => {
    const server = new MetaMockServer({ wabas: [{ id: 'x' }] });
    const { meta, vault } = makeMeta(server);
    const { deployment } = await seedDeployment(vault);

    const result = await processTemplateDeployment(prisma, meta, deployment.id);
    expect(result.status).toBe('PENDING');

    const updated = await prisma.templateDeployment.findUnique({ where: { id: deployment.id } });
    expect(updated?.status).toBe('PENDING');
    expect(updated?.externalTemplateId).toBe('TPL_cobranca_v1');
    expect(updated?.submittedAt).not.toBeNull();
  });

  it('em erro de permissão da Meta, marca ERROR preservando o código', async () => {
    const server = new MetaMockServer({
      failOn: { '/message_templates': { httpStatus: 403, code: 200, message: 'sem permissão' } },
    });
    const { meta, vault } = makeMeta(server);
    const { deployment } = await seedDeployment(vault);

    const result = await processTemplateDeployment(prisma, meta, deployment.id);
    expect(result.status).toBe('ERROR');

    const updated = await prisma.templateDeployment.findUnique({ where: { id: deployment.id } });
    expect(updated?.status).toBe('ERROR');
    expect(updated?.errorCode).toBe('200');
    expect(updated?.errorMessage).toContain('sem permissão');
  });

  it('é idempotente: não reenvia se já há externalTemplateId', async () => {
    const server = new MetaMockServer({ wabas: [{ id: 'x' }] });
    const { meta, vault } = makeMeta(server);
    const { deployment } = await seedDeployment(vault);
    await processTemplateDeployment(prisma, meta, deployment.id);
    const callsAfterFirst = server.calls.length;

    const second = await processTemplateDeployment(prisma, meta, deployment.id);
    expect(second.skipped).toBe(true);
    expect(server.calls.length).toBe(callsAfterFirst); // nenhuma chamada nova
  });

  it('ciclo completo: submissão (PENDING) → webhook APPROVED atualiza o deployment', async () => {
    const server = new MetaMockServer({ wabas: [{ id: 'x' }] });
    const { meta, vault } = makeMeta(server);
    const { org, deployment } = await seedDeployment(vault);
    await processTemplateDeployment(prisma, meta, deployment.id);

    // Simula o webhook de aprovação da Meta (Fase 4).
    const event = await prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        provider: 'meta',
        eventType: 'message_template_status_update',
        dedupeKey: `wh-${Date.now()}`,
        status: 'RECEIVED',
        rawPayload: {
          entry: [
            {
              changes: [
                {
                  field: 'message_template_status_update',
                  value: { message_template_id: 'TPL_cobranca_v1', event: 'APPROVED' },
                },
              ],
            },
          ],
        },
      },
    });
    const summary = await processWebhookEvent(prisma, event.id);
    expect(summary.templatesProcessed).toBe(1);

    const updated = await prisma.templateDeployment.findUnique({ where: { id: deployment.id } });
    expect(updated?.status).toBe('APPROVED');
  });
});
