import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { CredentialVault, MetaMockServer, MetaProvider } from '@wise/meta-provider';
import { CircuitBreaker, InMemoryBreakerStore } from '@wise/queue';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkerMeta } from '../meta.js';
import { processMessageSend } from '../processors/messageSend.js';
import { hasDb, makePrisma, resetDb, seedCampaign, seedCampaignChain } from './helpers.js';

const vault = new CredentialVault([{ version: 1, key: randomBytes(32) }]);

function makeMeta(server: MetaMockServer): WorkerMeta {
  const provider = new MetaProvider({
    baseUrl: 'https://graph.facebook.com',
    version: 'v23.0',
    appId: 'APP',
    appSecret: 'SECRET',
    fetchImpl: server.fetch,
  });
  return { provider, vault };
}

describe.skipIf(!hasDb)('processMessageSend', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Cria uma mensagem QUEUED com todo o encadeamento necessário. */
  async function seedMessage(paused = false) {
    const chain = await seedCampaignChain(prisma, vault, { paused });
    const contact = await prisma.contact.create({
      data: { organizationId: chain.org.id, phone: '+5511990001111' },
    });
    const campaign = await seedCampaign(prisma, chain.org.id, chain.template.id, chain.account.id);
    const recipient = await prisma.campaignRecipient.create({
      data: {
        organizationId: chain.org.id,
        campaignId: campaign.id,
        contactId: contact.id,
        phoneNumberId: chain.phone.id,
        templateDeploymentId: chain.deployment.id,
        dedupeKey: `dk_${contact.id}`,
      },
    });
    const message = await prisma.message.create({
      data: {
        organizationId: chain.org.id,
        campaignId: campaign.id,
        campaignRecipientId: recipient.id,
        contactId: contact.id,
        phoneNumberId: chain.phone.id,
        status: 'QUEUED',
        idempotencyKey: `msg_${campaign.id}_${contact.id}`,
      },
    });
    return { chain, contact, message };
  }

  it('envia via Meta e grava wamid + status SENT', async () => {
    const server = new MetaMockServer();
    const { message } = await seedMessage();
    const result = await processMessageSend(prisma, makeMeta(server), message.id);
    expect(result.status).toBe('SENT');

    const updated = await prisma.message.findUnique({ where: { id: message.id } });
    expect(updated?.status).toBe('SENT');
    expect(updated?.externalMessageId).toContain('wamid.MOCK');
    // Envio saiu do número autorizado.
    const sendCall = server.calls.find((c) => c.url.includes('/messages'));
    expect(sendCall).toBeDefined();
  });

  it('bloqueia envio para contato em opt-out (FAILED), sem chamar a Meta', async () => {
    const server = new MetaMockServer();
    const { chain, contact, message } = await seedMessage();
    await prisma.contactOptout.create({
      data: { organizationId: chain.org.id, contactId: contact.id },
    });
    const result = await processMessageSend(prisma, makeMeta(server), message.id);
    expect(result.status).toBe('FAILED');
    expect(server.calls.some((c) => c.url.includes('/messages'))).toBe(false);
    const updated = await prisma.message.findUnique({ where: { id: message.id } });
    expect(updated?.errorMessage).toContain('opt-out');
  });

  it('é idempotente: mensagem já SENT não reenvia', async () => {
    const server = new MetaMockServer();
    const { message } = await seedMessage();
    await processMessageSend(prisma, makeMeta(server), message.id);
    const callsAfterFirst = server.calls.length;
    const second = await processMessageSend(prisma, makeMeta(server), message.id);
    expect(second.skipped).toBe(true);
    expect(server.calls.length).toBe(callsAfterFirst);
  });

  it('circuit breaker aberto adia o envio (retryable) sem chamar a Meta (§28)', async () => {
    const server = new MetaMockServer();
    const { chain, message } = await seedMessage();
    const breaker = new CircuitBreaker(new InMemoryBreakerStore(), { failureThreshold: 1 });
    await breaker.recordFailure(chain.phone.id); // abre o breaker para o número

    await expect(processMessageSend(prisma, makeMeta(server), message.id, breaker)).rejects.toThrow();
    expect(server.calls.some((c) => c.url.includes('/messages'))).toBe(false);
    const updated = await prisma.message.findUnique({ where: { id: message.id } });
    expect(updated?.status).toBe('QUEUED'); // permanece na fila para retry
  });

  it('restrição da plataforma: PAUSA o número e cria alerta, sem redirecionar (§25)', async () => {
    const server = new MetaMockServer({
      failOn: { '/messages': { httpStatus: 403, code: 131031, message: 'conta bloqueada' } },
    });
    const { chain, message } = await seedMessage();
    const result = await processMessageSend(prisma, makeMeta(server), message.id);
    expect(result.status).toBe('FAILED');

    const phone = await prisma.phoneNumber.findUnique({ where: { id: chain.phone.id } });
    expect(phone?.isPaused).toBe(true);

    const alert = await prisma.systemAlert.findFirst({
      where: { organizationId: chain.org.id, code: 'PHONE_RESTRICTED' },
    });
    expect(alert).not.toBeNull();
  });
});
