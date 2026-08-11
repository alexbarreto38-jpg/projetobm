import { assertPermission, assertSuperAdmin, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * LGPD (spec §44). Ferramentas de conformidade: exportação de dados pessoais,
 * exclusão total da organização (direito ao esquecimento) e retenção
 * (minimização — apagar dados operacionais antigos).
 *
 * Segredos (tokens/credenciais) NUNCA entram na exportação — ela trata de dados
 * pessoais/operacionais, não de credenciais (spec §8, §42).
 */
export class LgpdService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Exporta os dados pessoais e operacionais da organização (sem segredos). */
  async exportData(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'org:manage');
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    if (!organization) throw notFound('Organização não encontrada.');

    const [contacts, consents, optouts, campaigns, messages, templates] = await Promise.all([
      this.prisma.contact.findMany({ where: { organizationId } }),
      this.prisma.contactConsent.findMany({ where: { organizationId } }),
      this.prisma.contactOptout.findMany({ where: { organizationId } }),
      this.prisma.campaign.findMany({
        where: { organizationId },
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.prisma.message.findMany({
        where: { organizationId },
        select: { id: true, contactId: true, status: true, externalMessageId: true, createdAt: true },
      }),
      this.prisma.template.findMany({
        where: { organizationId },
        select: { id: true, name: true, language: true, category: true, createdAt: true },
      }),
    ]);

    await this.audit(ctx, organizationId, 'LGPD_DATA_EXPORTED');
    return {
      exportedAt: new Date().toISOString(),
      organization,
      counts: {
        contacts: contacts.length,
        consents: consents.length,
        optouts: optouts.length,
        campaigns: campaigns.length,
        messages: messages.length,
        templates: templates.length,
      },
      data: { contacts, consents, optouts, campaigns, messages, templates },
    };
  }

  /**
   * Exclui TODA a organização e seus dados (cascade). Irreversível. Exige que o
   * chamador confirme com o slug e seja admin da organização (ou super admin).
   */
  async deleteOrganization(ctx: AuthContext, organizationId: string, confirmSlug: string) {
    assertPermission(ctx, organizationId, 'org:manage');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw notFound('Organização não encontrada.');
    if (org.isRoot) {
      assertSuperAdmin(ctx); // a organização raiz do SaaS só é removível por super admin
    }
    if (confirmSlug !== org.slug) {
      throw badRequest('Confirmação inválida: informe o slug exato da organização.');
    }

    // onDelete: Cascade nas FKs remove contatos, campanhas, mensagens, etc.
    await this.prisma.organization.delete({ where: { id: organizationId } });
    return { deleted: true, organizationId };
  }

  /** Retenção/minimização: remove dados operacionais antigos (spec §44). */
  async purgeOldData(ctx: AuthContext, organizationId: string, olderThanDays: number) {
    assertPermission(ctx, organizationId, 'org:manage');
    if (olderThanDays < 1) throw badRequest('Informe um período de retenção válido.');
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const [messageEvents, webhookEvents, messages] = await this.prisma.$transaction([
      this.prisma.messageEvent.deleteMany({ where: { organizationId, createdAt: { lt: cutoff } } }),
      this.prisma.webhookEvent.deleteMany({ where: { organizationId, createdAt: { lt: cutoff } } }),
      this.prisma.message.deleteMany({
        where: { organizationId, createdAt: { lt: cutoff }, status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } },
      }),
    ]);

    await this.audit(ctx, organizationId, 'LGPD_DATA_PURGED', {
      olderThanDays,
      deleted: { messageEvents: messageEvents.count, webhookEvents: webhookEvents.count, messages: messages.count },
    });
    return {
      cutoff: cutoff.toISOString(),
      deleted: {
        messageEvents: messageEvents.count,
        webhookEvents: webhookEvents.count,
        messages: messages.count,
      },
    };
  }

  private async audit(
    ctx: AuthContext,
    organizationId: string,
    action: string,
    metadata?: object,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId: ctx.userId, action, entityType: 'organization', entityId: organizationId, metadata },
    });
  }
}
