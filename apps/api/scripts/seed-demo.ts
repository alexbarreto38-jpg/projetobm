/**
 * Seed de demonstração para desenvolvimento local (contra o mock-meta).
 *
 * Cria uma organização "Empresa Demo" já conectada (conta + 2 números), um
 * template aprovado e contatos com consentimento — para o painel abrir populado.
 * Idempotente. Requer DATABASE_URL e ENCRYPTION_KEY no ambiente.
 *
 *   pnpm --filter @wise/api seed:demo
 */
import { hashPassword } from '@wise/auth';
import { prisma } from '@wise/database';
import { CredentialVault } from '@wise/meta-provider';

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@demo.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo12345678';
const WABA_ID = process.env.MOCK_WABA_ID ?? 'WABA_DEMO';

async function main() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error('ENCRYPTION_KEY é obrigatório para cifrar a credencial demo.');
  const vault = CredentialVault.fromEnv(encryptionKey, process.env.ENCRYPTION_KEY_PREVIOUS);

  const org = await prisma.organization.upsert({
    where: { slug: 'empresa-demo' },
    update: {},
    create: { name: 'Empresa Demo', slug: 'empresa-demo' },
  });

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: 'Demo', passwordHash: await hashPassword(PASSWORD) },
  });
  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: 'ORGANIZATION_ADMIN' },
    create: { organizationId: org.id, userId: user.id, role: 'ORGANIZATION_ADMIN' },
  });

  const encryptedToken = vault.encrypt('MOCK_SYSTEM_TOKEN');
  const credential = await prisma.credential.create({
    data: {
      organizationId: org.id,
      provider: 'meta',
      encryptedToken,
      keyVersion: vault.keyVersionOf(encryptedToken),
      tokenType: 'system_user',
      status: 'ACTIVE',
    },
  });
  const connection = await prisma.metaConnection.create({
    data: { organizationId: org.id, provider: 'meta', status: 'CONNECTED', credentialId: credential.id, metaBusinessId: 'BM_DEMO' },
  });
  const account = await prisma.whatsAppAccount.upsert({
    where: { organizationId_externalAccountId: { organizationId: org.id, externalAccountId: WABA_ID } },
    update: { metaConnectionId: connection.id },
    create: {
      organizationId: org.id,
      metaConnectionId: connection.id,
      externalAccountId: WABA_ID,
      legacyWabaId: WABA_ID,
      accountModel: 'LEGACY',
      name: 'Empresa Demo',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
    },
  });
  for (const [id, display] of [['PN_DEMO_1', '+55 11 90000-0001'], ['PN_DEMO_2', '+55 11 90000-0002']]) {
    await prisma.phoneNumber.upsert({
      where: { whatsappAccountId_externalPhoneNumberId: { whatsappAccountId: account.id, externalPhoneNumberId: id } },
      update: {},
      create: {
        organizationId: org.id,
        whatsappAccountId: account.id,
        externalPhoneNumberId: id,
        displayPhoneNumber: display,
        qualityStatus: 'GREEN',
      },
    });
  }

  const template = await prisma.template.upsert({
    where: { organizationId_name_language: { organizationId: org.id, name: 'boas_vindas', language: 'pt_BR' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'boas_vindas',
      language: 'pt_BR',
      category: 'MARKETING',
      status: 'ACTIVE',
      components: [{ type: 'BODY', text: 'Olá {{1}}, seja bem-vindo à Empresa Demo!' }],
    },
  });
  await prisma.templateDeployment.upsert({
    where: { templateId_targetAccountId: { templateId: template.id, targetAccountId: account.id } },
    update: { status: 'APPROVED' },
    create: {
      organizationId: org.id,
      templateId: template.id,
      targetAccountId: account.id,
      externalTemplateId: 'TPL_boas_vindas',
      status: 'APPROVED',
      idempotencyKey: `tpl_${template.id}_acc_${account.id}`,
    },
  });

  for (let i = 1; i <= 5; i += 1) {
    const phone = `+5511990001${String(i).padStart(3, '0')}`;
    const contact = await prisma.contact.upsert({
      where: { organizationId_phone: { organizationId: org.id, phone } },
      update: {},
      create: { organizationId: org.id, phone, name: `Contato ${i}`, source: 'seed-demo' },
    });
    await prisma.contactConsent.create({
      data: { organizationId: org.id, contactId: contact.id, consentType: 'MARKETING', source: 'seed-demo', status: 'GRANTED' },
    });
  }

  console.log(`Seed demo pronto. Login: ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
