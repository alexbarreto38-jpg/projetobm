import type { PrismaClient } from '@wise/database';
import type { AuthContext } from '@wise/auth';
import type { RoleName } from '@wise/types';

/**
 * Monta o AuthContext a partir do banco a cada request autenticado (spec §10).
 * Papéis/permissões vêm SEMPRE do banco — o token só identifica o usuário.
 * Retorna null se o usuário não existir mais (ex.: removido após emitir token).
 */
export async function buildAuthContext(
  prisma: PrismaClient,
  userId: string,
): Promise<AuthContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: true },
  });
  if (!user) return null;

  const memberships: Record<string, RoleName> = {};
  for (const m of user.memberships) {
    memberships[m.organizationId] = m.role as RoleName;
  }

  return {
    userId: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    memberships,
  };
}
