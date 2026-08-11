import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { notFound } from '../../lib/errors.js';

/**
 * AccountHealthService (spec §29). Painel de saúde por conta: conexão,
 * permissão (credencial), conta, número, webhook e templates. Baseado no estado
 * local (source of truth da Meta é sincronizado pelo MetaSyncService).
 */
export interface HealthCheck {
  ok: boolean;
  detail?: string;
}
export interface AccountHealth {
  connection: HealthCheck;
  permission: HealthCheck;
  account: HealthCheck;
  number: HealthCheck;
  webhook: HealthCheck;
  templates: HealthCheck;
  lastCheckedAt: string;
}

export class AccountHealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async check(ctx: AuthContext, organizationId: string, accountId: string): Promise<AccountHealth> {
    assertPermission(ctx, organizationId, 'account:read');
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: accountId, organizationId },
      include: {
        metaConnection: { include: { credential: true } },
        phoneNumbers: true,
      },
    });
    if (!account) throw notFound('Conta não encontrada.');

    const conn = account.metaConnection;
    const cred = conn.credential;
    const numbers = account.phoneNumbers;
    const activeNumbers = numbers.filter((n) => !n.isPaused);
    const approved = await this.prisma.templateDeployment.count({
      where: { targetAccountId: accountId, status: 'APPROVED' },
    });

    const credentialOk =
      Boolean(cred) &&
      cred!.status === 'ACTIVE' &&
      (!cred!.expiresAt || cred!.expiresAt.getTime() > Date.now());

    return {
      connection: {
        ok: conn.status === 'CONNECTED',
        detail: conn.status,
      },
      permission: {
        ok: credentialOk,
        detail: cred ? cred.status : 'sem credencial',
      },
      account: {
        ok: Boolean(account.externalAccountId),
        detail: account.status ?? undefined,
      },
      number: {
        ok: activeNumbers.length > 0,
        detail: `${activeNumbers.length}/${numbers.length} ativos`,
      },
      webhook: {
        ok: conn.status === 'CONNECTED',
        detail: conn.status === 'CONNECTED' ? 'assinado' : 'verificar assinatura',
      },
      templates: {
        ok: approved > 0,
        detail: `${approved} aprovado(s)`,
      },
      lastCheckedAt: new Date().toISOString(),
    };
  }
}
