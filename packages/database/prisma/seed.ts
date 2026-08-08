import { PrismaClient, Role } from '@prisma/client';

/**
 * Seed mínimo (spec §71 — MVP começa com 1 organização).
 * Cria a organização raiz "Wise" que administra o SaaS. Idempotente.
 */
const prisma = new PrismaClient();

async function main() {
  const wise = await prisma.organization.upsert({
    where: { slug: 'wise' },
    update: {},
    create: { name: 'Wise', slug: 'wise', isRoot: true },
  });

  const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL;
  if (superAdminEmail) {
    const user = await prisma.user.upsert({
      where: { email: superAdminEmail },
      update: { isSuperAdmin: true },
      create: { email: superAdminEmail, name: 'Super Admin', isSuperAdmin: true },
    });
    await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: wise.id, userId: user.id } },
      update: { role: Role.SUPER_ADMIN },
      create: { organizationId: wise.id, userId: user.id, role: Role.SUPER_ADMIN },
    });
  }

  console.log(`Seed concluído. Organização raiz: ${wise.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
