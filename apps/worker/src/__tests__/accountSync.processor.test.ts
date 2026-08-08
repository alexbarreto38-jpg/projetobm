import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { CredentialVault, MetaMockServer, MetaProvider } from '@wise/meta-provider';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkerMeta } from '../meta.js';
import { processAccountSync } from '../processors/accountSync.js';
import { hasDb, makePrisma, resetDb, seedCampaignChain } from './helpers.js';

const vault = new CredentialVault([{ version: 1, key: randomBytes(32) }]);

describe.skipIf(!hasDb)('processAccountSync (MetaSyncService)', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('re-busca dados e números da Meta e atualiza o banco (upsert)', async () => {
    const chain = await seedCampaignChain(prisma, vault);
    // A Meta agora reporta um número a mais e um nome atualizado.
    const server = new MetaMockServer({
      wabas: [
        {
          id: chain.account.externalAccountId,
          name: 'Nome Atualizado',
          currency: 'BRL',
          phone_numbers: [
            { id: chain.phone.externalPhoneNumberId, display_phone_number: '+55 11 90000-0000', quality_rating: 'GREEN' },
            { id: 'PN_NOVO', display_phone_number: '+55 11 90000-0002', quality_rating: 'YELLOW' },
          ],
        },
      ],
    });
    const meta: WorkerMeta = {
      provider: new MetaProvider({
        baseUrl: 'https://graph.facebook.com',
        version: 'v23.0',
        appId: 'APP',
        appSecret: 'SECRET',
        fetchImpl: server.fetch,
      }),
      vault,
    };

    const result = await processAccountSync(prisma, meta, {
      organizationId: chain.org.id,
      accountId: chain.account.id,
    });
    expect(result.numbers).toBe(2);

    const account = await prisma.whatsAppAccount.findUnique({ where: { id: chain.account.id } });
    expect(account?.name).toBe('Nome Atualizado');
    expect(account?.lastSyncAt).not.toBeNull();

    const numbers = await prisma.phoneNumber.findMany({ where: { whatsappAccountId: chain.account.id } });
    expect(numbers).toHaveLength(2); // upsert do existente + novo
  });

  it('ignora sync quando a credencial é inválida', async () => {
    const chain = await seedCampaignChain(prisma, vault);
    await prisma.credential.update({
      where: { id: chain.credential.id },
      data: { status: 'REVOKED' },
    });
    const meta: WorkerMeta = {
      provider: new MetaProvider({
        baseUrl: 'https://graph.facebook.com',
        version: 'v23.0',
        appId: 'A',
        appSecret: 'S',
        fetchImpl: new MetaMockServer().fetch,
      }),
      vault,
    };
    const result = await processAccountSync(prisma, meta, {
      organizationId: chain.org.id,
      accountId: chain.account.id,
    });
    expect(result.skipped).toBe(true);
  });
});
