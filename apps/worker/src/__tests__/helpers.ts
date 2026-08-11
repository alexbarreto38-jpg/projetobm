import { PrismaClient } from '@wise/database';

export const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
export const hasDb = Boolean(TEST_DB_URL);

export function makePrisma(): PrismaClient {
  const url = TEST_DB_URL ?? 'postgresql://localhost:5432/none';
  return new PrismaClient({ datasources: { db: { url } } });
}

const TABLES = [
  'webhook_events',
  'message_events',
  'messages',
  'template_deployments',
  'templates',
  'phone_numbers',
  'whatsapp_accounts',
  'meta_connections',
  'credentials',
  'audit_logs',
  'organization_users',
  'organizations',
  'users',
];

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

/** Cria org + conexão + conta WhatsApp mínimas para testes de processamento. */
export async function seedAccount(prisma: PrismaClient) {
  const org = await prisma.organization.create({
    data: { name: 'Org Teste', slug: `org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const connection = await prisma.metaConnection.create({
    data: { organizationId: org.id, provider: 'meta', status: 'CONNECTED' },
  });
  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: org.id,
      metaConnectionId: connection.id,
      externalAccountId: `WABA_${connection.id}`,
      accountModel: 'LEGACY',
    },
  });
  return { org, connection, account };
}

/**
 * Encadeamento completo para testes de campanha/envio: org + credencial cifrada
 * + conexão + conta + número (não pausado) + template + deployment APPROVED.
 */
export async function seedCampaignChain(
  prisma: PrismaClient,
  vault: { encrypt(v: string): string },
  opts: { paused?: boolean } = {},
) {
  const org = await prisma.organization.create({
    data: { name: 'Org', slug: `org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const credential = await prisma.credential.create({
    data: {
      organizationId: org.id,
      provider: 'meta',
      encryptedToken: vault.encrypt('SYS_TOKEN'),
      keyVersion: 1,
      status: 'ACTIVE',
    },
  });
  const connection = await prisma.metaConnection.create({
    data: { organizationId: org.id, provider: 'meta', status: 'CONNECTED', credentialId: credential.id },
  });
  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: org.id,
      metaConnectionId: connection.id,
      externalAccountId: `WABA_${connection.id}`,
      accountModel: 'LEGACY',
    },
  });
  const phone = await prisma.phoneNumber.create({
    data: {
      organizationId: org.id,
      whatsappAccountId: account.id,
      externalPhoneNumberId: `PN_${account.id}`,
      displayPhoneNumber: '+5511990000000',
      isPaused: opts.paused ?? false,
    },
  });
  const template = await prisma.template.create({
    data: {
      organizationId: org.id,
      name: 'aviso_v1',
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
      externalTemplateId: 'TPL_1',
      status: 'APPROVED',
      idempotencyKey: `tpl_${template.id}_acc_${account.id}`,
    },
  });
  return { org, credential, connection, account, phone, template, deployment };
}

export async function seedCampaign(
  prisma: PrismaClient,
  organizationId: string,
  templateId: string,
  accountId: string,
) {
  const campaign = await prisma.campaign.create({
    data: {
      organizationId,
      name: 'Campanha',
      templateId,
      status: 'RUNNING',
      idempotencyKey: `camp_${Date.now()}_${Math.random()}`,
    },
  });
  await prisma.campaignTarget.create({
    data: { organizationId, campaignId: campaign.id, whatsappAccountId: accountId },
  });
  return campaign;
}
