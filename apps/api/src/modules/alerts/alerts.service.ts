import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { notFound } from '../../lib/errors.js';

/**
 * AlertsService (spec §36, §74). Lista e resolve alertas do sistema (ex.:
 * número restrito, token expirado, template rejeitado, webhook fora do ar).
 */
export class AlertsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ctx: AuthContext, organizationId: string, onlyOpen = true) {
    assertPermission(ctx, organizationId, 'account:read');
    return this.prisma.systemAlert.findMany({
      where: {
        organizationId,
        ...(onlyOpen ? { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } : {}),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async setStatus(
    ctx: AuthContext,
    organizationId: string,
    alertId: string,
    status: 'ACKNOWLEDGED' | 'RESOLVED',
  ) {
    assertPermission(ctx, organizationId, 'account:sync');
    const alert = await this.prisma.systemAlert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw notFound('Alerta não encontrado.');
    return this.prisma.systemAlert.update({ where: { id: alert.id }, data: { status } });
  }
}
