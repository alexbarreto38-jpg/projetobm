import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma singleton.
 *
 * Em desenvolvimento, o hot-reload do Next.js/tsx pode instanciar múltiplos
 * clientes e esgotar o pool de conexões. Guardamos a instância em globalThis
 * para reutilizá-la entre recargas.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
