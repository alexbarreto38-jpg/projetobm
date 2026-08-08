import { assertPermission, type AuthContext } from '@wise/auth';
import type { Prisma, PrismaClient } from '@wise/database';
import type { AdapterContext, HealthReport } from '@wise/meta-provider';
import { notFound } from '../../lib/errors.js';
import type { MetaContext } from '../../meta/context.js';
import { CredentialService } from './credential.service.js';

/**
 * MetaConnectionService (spec §7, §11, §12, §50).
 *
 * Orquestra a conexão oficial: valida o token contra a Meta, descobre os ativos
 * (WABA + números), assina webhooks e persiste tudo de forma idempotente
 * (reconectar a mesma WABA atualiza, não duplica). A Meta é source of truth;
 * guardamos os IDs oficiais ao lado da representação interna.
 */
export class MetaConnectionService {
  private readonly credentials: CredentialService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly meta: MetaContext,
  ) {
    this.credentials = new CredentialService(prisma, meta.vault);
  }

  /** Fluxo Embedded Signup: troca o code por token e conecta (spec §7). */
  async connectFromCode(params: {
    ctx: AuthContext;
    organizationId: string;
    code: string;
    wabaId: string;
    redirectUri?: string;
    requestId?: string;
  }) {
    assertPermission(params.ctx, params.organizationId, 'connection:manage');
    const { accessToken } = await this.meta.provider.oauth.exchangeCode(
      params.code,
      params.redirectUri,
      params.requestId,
    );
    return this.connect({ ...params, accessToken });
  }

  /**
   * Conecta uma WABA a partir de um access token já obtido. Idempotente.
   */
  async connect(params: {
    ctx: AuthContext;
    organizationId: string;
    accessToken: string;
    wabaId: string;
    requestId?: string;
  }) {
    const { ctx, organizationId, accessToken, wabaId, requestId } = params;
    assertPermission(ctx, organizationId, 'connection:manage');

    const adapter = this.meta.provider.adapterFor('LEGACY');
    const adapterCtx: AdapterContext = {
      externalAccountId: wabaId,
      accessToken,
      requestId,
    };

    // Chamadas à Meta ANTES da transação (não seguramos conexões de banco
    // durante I/O de rede). Erros viram MetaApiError e sobem ao error handler.
    const info = await adapter.getAccountInfo(adapterCtx);
    const numbers = await adapter.listPhoneNumbers(adapterCtx);
    await adapter.subscribeWebhooks(adapterCtx);

    const persisted = await this.prisma.$transaction(async (tx) => {
      const credential = await this.credentials.store({
        organizationId,
        plaintextToken: accessToken,
        tokenType: 'embedded_signup',
        tx,
      });

      const existing = await tx.whatsAppAccount.findUnique({
        where: { organizationId_externalAccountId: { organizationId, externalAccountId: wabaId } },
      });

      const connection = existing
        ? await tx.metaConnection.update({
            where: { id: existing.metaConnectionId },
            data: { credentialId: credential.id, status: 'CONNECTED', lastSyncAt: new Date() },
          })
        : await tx.metaConnection.create({
            data: {
              organizationId,
              provider: 'meta',
              credentialId: credential.id,
              status: 'CONNECTED',
              lastSyncAt: new Date(),
            },
          });

      const account = await tx.whatsAppAccount.upsert({
        where: {
          organizationId_externalAccountId: { organizationId, externalAccountId: wabaId },
        },
        create: {
          organizationId,
          metaConnectionId: connection.id,
          externalAccountId: wabaId,
          legacyWabaId: wabaId,
          accountModel: 'LEGACY',
          name: info.name,
          currency: info.currency,
          timezone: info.timezone,
          status: info.status,
          lastSyncAt: new Date(),
        },
        update: {
          metaConnectionId: connection.id,
          name: info.name,
          currency: info.currency,
          timezone: info.timezone,
          status: info.status,
          lastSyncAt: new Date(),
        },
      });

      for (const n of numbers) {
        await tx.phoneNumber.upsert({
          where: {
            whatsappAccountId_externalPhoneNumberId: {
              whatsappAccountId: account.id,
              externalPhoneNumberId: n.externalPhoneNumberId,
            },
          },
          create: {
            organizationId,
            whatsappAccountId: account.id,
            externalPhoneNumberId: n.externalPhoneNumberId,
            displayPhoneNumber: n.displayPhoneNumber,
            verifiedName: n.verifiedName,
            qualityStatus: n.qualityStatus,
            platformStatus: n.platformStatus,
            messagingLimitInfo: toJson(n.messagingLimitInfo),
          },
          update: {
            displayPhoneNumber: n.displayPhoneNumber,
            verifiedName: n.verifiedName,
            qualityStatus: n.qualityStatus,
            platformStatus: n.platformStatus,
            messagingLimitInfo: toJson(n.messagingLimitInfo),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: ctx.userId,
          action: 'META_CONNECTION_CREATED',
          entityType: 'meta_connection',
          entityId: connection.id,
        },
      });

      return { connection, account };
    });

    // Health check pós-conexão (spec §29), fora da transação.
    let health: HealthReport | null = null;
    try {
      health = await adapter.getHealth(adapterCtx);
    } catch {
      health = null;
    }

    const phoneNumbers = await this.prisma.phoneNumber.findMany({
      where: { whatsappAccountId: persisted.account.id },
    });

    return { ...persisted, phoneNumbers, health };
  }

  /** Lista contas WhatsApp e números da organização (escopado — spec §37). */
  async listAccounts(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'account:read');
    return this.prisma.whatsAppAccount.findMany({
      where: { organizationId },
      include: {
        phoneNumbers: true,
        metaConnection: { select: { id: true, status: true, lastSyncAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Re-sincroniza uma conta com a Meta (source of truth — spec §50). */
  async syncAccount(ctx: AuthContext, organizationId: string, accountId: string) {
    assertPermission(ctx, organizationId, 'account:sync');
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: accountId, organizationId },
      include: { metaConnection: true },
    });
    if (!account) throw notFound('Conta não encontrada.');
    if (!account.metaConnection.credentialId) throw notFound('Credencial ausente para a conta.');

    const token = await this.credentials.reveal(account.metaConnection.credentialId);
    if (!token) throw notFound('Credencial inválida ou revogada.');

    return this.connect({
      ctx,
      organizationId,
      accessToken: token,
      wabaId: account.externalAccountId,
    });
  }

  /** Desconecta: revoga conexão e credencial (spec §8). */
  async disconnect(ctx: AuthContext, organizationId: string, connectionId: string) {
    assertPermission(ctx, organizationId, 'connection:manage');
    const connection = await this.prisma.metaConnection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!connection) throw notFound('Conexão não encontrada.');

    await this.prisma.$transaction(async (tx) => {
      await tx.metaConnection.update({
        where: { id: connection.id },
        data: { status: 'REVOKED' },
      });
      if (connection.credentialId) {
        await tx.credential.update({
          where: { id: connection.credentialId },
          data: { status: 'REVOKED' },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: ctx.userId,
          action: 'META_CONNECTION_REVOKED',
          entityType: 'meta_connection',
          entityId: connection.id,
        },
      });
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue);
}
