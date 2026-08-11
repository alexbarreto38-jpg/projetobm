import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';

/**
 * AuditService (spec §33, §35). Lista o registro de ações sensíveis por
 * organização — apenas leitura, para admins/auditores (permissão audit:read).
 */
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ctx: AuthContext, organizationId: string, limit = 50, cursor?: string) {
    assertPermission(ctx, organizationId, 'audit:read');
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });
    const nextCursor = logs.length > limit ? logs.pop()!.id : null;
    return { logs, nextCursor };
  }
}
