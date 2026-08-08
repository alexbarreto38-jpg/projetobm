import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { CredentialVault } from '@wise/meta-provider';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processCampaign } from '../processors/campaignProcessing.js';
import { hasDb, makePrisma, resetDb, seedCampaign, seedCampaignChain } from './helpers.js';

const vault = new CredentialVault([{ version: 1, key: randomBytes(32) }]);

class FakeMsgEnqueuer {
  readonly ids: string[] = [];
  async enqueue(id: string) {
    this.ids.push(id);
  }
}

describe.skipIf(!hasDb)('processCampaign (CampaignRouter)', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function contacts(organizationId: string, n: number) {
    for (let i = 0; i < n; i += 1) {
      await prisma.contact.create({ data: { organizationId, phone: `+551199000${1000 + i}` } });
    }
  }

  it('gera destinatários e mensagens, excluindo opt-out, e enfileira envios', async () => {
    const chain = await seedCampaignChain(prisma, vault);
    await contacts(chain.org.id, 3);
    // Um contato em opt-out deve ser excluído.
    const excluded = await prisma.contact.create({
      data: { organizationId: chain.org.id, phone: '+5511990009999' },
    });
    await prisma.contactOptout.create({
      data: { organizationId: chain.org.id, contactId: excluded.id },
    });
    const campaign = await seedCampaign(prisma, chain.org.id, chain.template.id, chain.account.id);

    const enq = new FakeMsgEnqueuer();
    const summary = await processCampaign(prisma, campaign.id, enq);
    expect(summary.recipients).toBe(3); // opt-out excluído
    expect(summary.messages).toBe(3);
    expect(enq.ids).toHaveLength(3);

    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipients).toHaveLength(3);
    // Cada destinatário registra o ativo (número + deployment) usado (§53).
    expect(recipients.every((r) => r.phoneNumberId === chain.phone.id)).toBe(true);
    expect(recipients.every((r) => r.templateDeploymentId === chain.deployment.id)).toBe(true);
  });

  it('é idempotente: reprocessar não duplica destinatários nem mensagens', async () => {
    const chain = await seedCampaignChain(prisma, vault);
    await contacts(chain.org.id, 2);
    const campaign = await seedCampaign(prisma, chain.org.id, chain.template.id, chain.account.id);

    const enq = new FakeMsgEnqueuer();
    await processCampaign(prisma, campaign.id, enq);
    const second = await processCampaign(prisma, campaign.id, enq);
    expect(second.messages).toBe(0);

    expect(await prisma.message.count({ where: { campaignId: campaign.id } })).toBe(2);
    expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(2);
  });

  it('CANCEL_REQUESTED interrompe a geração e finaliza como CANCELLED', async () => {
    const chain = await seedCampaignChain(prisma, vault);
    await contacts(chain.org.id, 2);
    const campaign = await seedCampaign(prisma, chain.org.id, chain.template.id, chain.account.id);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CANCEL_REQUESTED' } });

    const summary = await processCampaign(prisma, campaign.id);
    expect(summary.status).toBe('CANCELLED');
    expect(summary.messages).toBe(0);
  });

  it('sem número disponível (pausado) → campanha FAILED', async () => {
    const chain = await seedCampaignChain(prisma, vault, { paused: true });
    await contacts(chain.org.id, 1);
    const campaign = await seedCampaign(prisma, chain.org.id, chain.template.id, chain.account.id);

    const summary = await processCampaign(prisma, campaign.id);
    expect(summary.status).toBe('FAILED');
    expect(summary.routes).toBe(0);
  });
});
