import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import type { AccountModel } from '@wise/types';
import type { WorkerMeta } from '../meta.js';

/**
 * MetaSyncService (spec §50). A Meta é source of truth para os ativos: aqui
 * re-buscamos detalhes da conta e a lista de números e atualizamos o banco
 * (upsert por número). Não confiamos apenas no estado local.
 */
export interface SyncResult {
  numbers: number;
  skipped: boolean;
}

export async function processAccountSync(
  prisma: PrismaClient,
  meta: WorkerMeta,
  params: { organizationId: string; accountId: string },
): Promise<SyncResult> {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: params.accountId, organizationId: params.organizationId },
    include: { metaConnection: true },
  });
  if (!account) throw new Error(`Conta ${params.accountId} não encontrada.`);

  const credentialId = account.metaConnection.credentialId;
  const credential = credentialId
    ? await prisma.credential.findUnique({ where: { id: credentialId } })
    : null;
  if (!credential || credential.status !== 'ACTIVE') {
    logger.warn({ accountId: account.id }, 'Sync ignorado: credencial inválida');
    return { numbers: 0, skipped: true };
  }

  const accessToken = meta.vault.decrypt(credential.encryptedToken);
  const adapter = meta.provider.adapterFor(account.accountModel as AccountModel);
  const ctx = { externalAccountId: account.externalAccountId, accessToken };

  const info = await adapter.getAccountInfo(ctx);
  const numbers = await adapter.listPhoneNumbers(ctx);

  await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      name: info.name ?? account.name,
      currency: info.currency ?? account.currency,
      timezone: info.timezone ?? account.timezone,
      status: info.status ?? account.status,
      lastSyncAt: new Date(),
    },
  });

  for (const n of numbers) {
    await prisma.phoneNumber.upsert({
      where: {
        whatsappAccountId_externalPhoneNumberId: {
          whatsappAccountId: account.id,
          externalPhoneNumberId: n.externalPhoneNumberId,
        },
      },
      create: {
        organizationId: account.organizationId,
        whatsappAccountId: account.id,
        externalPhoneNumberId: n.externalPhoneNumberId,
        displayPhoneNumber: n.displayPhoneNumber,
        verifiedName: n.verifiedName,
        qualityStatus: n.qualityStatus,
        platformStatus: n.platformStatus,
      },
      update: {
        displayPhoneNumber: n.displayPhoneNumber,
        verifiedName: n.verifiedName,
        qualityStatus: n.qualityStatus,
        platformStatus: n.platformStatus,
      },
    });
  }

  await prisma.metaConnection.update({
    where: { id: account.metaConnectionId },
    data: { lastSyncAt: new Date() },
  });

  logger.info({ accountId: account.id, numbers: numbers.length }, 'Conta sincronizada');
  return { numbers: numbers.length, skipped: false };
}
