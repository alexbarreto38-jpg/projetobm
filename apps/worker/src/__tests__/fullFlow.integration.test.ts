import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { CredentialVault, MetaMockServer, MetaProvider } from '@wise/meta-provider';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkerMeta } from '../meta.js';
import { processCampaign } from '../processors/campaignProcessing.js';
import { processMessageSend } from '../processors/messageSend.js';
import { processTemplateDeployment } from '../processors/templateDeployment.js';
import { processWebhookEvent } from '../processors/webhook.js';
import { hasDb, makePrisma, resetDb } from './helpers.js';

const vault = new CredentialVault([{ version: 1, key: randomBytes(32) }]);

function makeMeta(server: MetaMockServer): WorkerMeta {
  return {
    provider: new MetaProvider({
      baseUrl: 'https://graph.facebook.com',
      version: 'v23.0',
      appId: 'APP',
      appSecret: 'SECRET',
      fetchImpl: server.fetch,
    }),
    vault,
  };
}

/**
 * Prova automatizada do fluxo mínimo de produção (spec §72):
 * template → submissão → aprovação (webhook) → campanha → preflight (implícito) →
 * geração de mensagens → envio → entrega/leitura (webhook) → relatório.
 * Tudo contra o MetaMockServer, de forma determinística.
 */
describe.skipIf(!hasDb)('fluxo completo (§72) contra o mock', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('do template ao relatório: mensagens chegam a READ, opt-out excluído', async () => {
    const server = new MetaMockServer();
    const meta = makeMeta(server);

    // --- seed: org conectada + template com deployment QUEUED ---
    const org = await prisma.organization.create({ data: { name: 'Org', slug: `org-${Date.now()}` } });
    const credential = await prisma.credential.create({
      data: { organizationId: org.id, provider: 'meta', encryptedToken: vault.encrypt('TOK'), keyVersion: 1, status: 'ACTIVE' },
    });
    const connection = await prisma.metaConnection.create({
      data: { organizationId: org.id, provider: 'meta', status: 'CONNECTED', credentialId: credential.id },
    });
    const account = await prisma.whatsAppAccount.create({
      data: { organizationId: org.id, metaConnectionId: connection.id, externalAccountId: 'WABA_F', accountModel: 'LEGACY' },
    });
    const phone = await prisma.phoneNumber.create({
      data: { organizationId: org.id, whatsappAccountId: account.id, externalPhoneNumberId: 'PN_F', displayPhoneNumber: '+55119', isPaused: false },
    });
    const template = await prisma.template.create({
      data: { organizationId: org.id, name: 'promo_v1', language: 'pt_BR', category: 'UTILITY', components: [{ type: 'BODY', text: 'Oi {{1}}' }] },
    });
    const deployment = await prisma.templateDeployment.create({
      data: { organizationId: org.id, templateId: template.id, targetAccountId: account.id, status: 'QUEUED', idempotencyKey: `tpl_${template.id}_acc_${account.id}` },
    });

    // 1) Submissão do template → PENDING + externalTemplateId
    const sub = await processTemplateDeployment(prisma, meta, deployment.id);
    expect(sub.status).toBe('PENDING');
    const submitted = await prisma.templateDeployment.findUnique({ where: { id: deployment.id } });
    expect(submitted?.externalTemplateId).toBe('TPL_promo_v1');

    // 2) Aprovação via webhook da Meta
    const approval = await prisma.webhookEvent.create({
      data: {
        provider: 'meta', eventType: 'message_template_status_update', dedupeKey: `ap-${Date.now()}`, status: 'RECEIVED',
        rawPayload: { entry: [{ changes: [{ field: 'message_template_status_update', value: { message_template_id: 'TPL_promo_v1', event: 'APPROVED' } }] }] },
      },
    });
    await processWebhookEvent(prisma, approval.id);
    expect((await prisma.templateDeployment.findUnique({ where: { id: deployment.id } }))?.status).toBe('APPROVED');

    // 3) Público: 3 elegíveis + 1 em opt-out
    for (let i = 0; i < 3; i += 1) {
      await prisma.contact.create({ data: { organizationId: org.id, phone: `+5511990002${100 + i}` } });
    }
    const excluded = await prisma.contact.create({ data: { organizationId: org.id, phone: '+5511990009999' } });
    await prisma.contactOptout.create({ data: { organizationId: org.id, contactId: excluded.id } });

    // 4) Campanha em execução
    const campaign = await prisma.campaign.create({
      data: { organizationId: org.id, name: 'Campanha F', templateId: template.id, status: 'RUNNING', idempotencyKey: `camp-${Date.now()}` },
    });
    await prisma.campaignTarget.create({ data: { organizationId: org.id, campaignId: campaign.id, whatsappAccountId: account.id } });

    // 5) Roteamento → gera 3 mensagens (opt-out excluído)
    const enq: string[] = [];
    const gen = await processCampaign(prisma, campaign.id, { enqueue: async (id) => void enq.push(id) });
    expect(gen.messages).toBe(3);
    expect(enq).toHaveLength(3);

    // 6) Envio de cada mensagem → SENT + wamid
    const messages = await prisma.message.findMany({ where: { campaignId: campaign.id } });
    for (const m of messages) {
      const r = await processMessageSend(prisma, meta, m.id);
      expect(r.status).toBe('SENT');
    }

    // 7) Webhooks de entrega/leitura por wamid → READ
    const sent = await prisma.message.findMany({ where: { campaignId: campaign.id } });
    for (const m of sent) {
      const ev = await prisma.webhookEvent.create({
        data: {
          provider: 'meta', eventType: 'messages', dedupeKey: `dl-${m.id}`, status: 'RECEIVED',
          rawPayload: { entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: m.externalMessageId, status: 'read', timestamp: '1700000000' }] } }] }] },
        },
      });
      await processWebhookEvent(prisma, ev.id);
    }

    // 8) Relatório: 3 mensagens, todas READ; nada para o contato em opt-out
    const grouped = await prisma.message.groupBy({ by: ['status'], where: { organizationId: org.id }, _count: { _all: true } });
    const readCount = grouped.find((g) => g.status === 'READ')?._count._all ?? 0;
    expect(readCount).toBe(3);
    expect(phone.isPaused).toBe(false); // nenhum número foi pausado
    const optoutMsgs = await prisma.message.count({ where: { contactId: excluded.id } });
    expect(optoutMsgs).toBe(0);
  });
});
