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
