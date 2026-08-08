import {
  assertOrganizationAccess,
  assertPermission,
  type AuthContext,
} from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateMemberRoleInput,
  UpdateOrganizationInput,
} from '@wise/validation';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { slugify, uniqueSlug } from './slug.js';

/**
 * OrganizationService (spec §10, §34). TODA operação valida acesso/permissão do
 * ctx no backend antes de tocar dados. Nenhum método confia no frontend para
 * isolamento; consultas são sempre escopadas pela associação do usuário.
 */
export class OrganizationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Lista as organizações visíveis ao usuário (todas, se super admin). */
  async list(ctx: AuthContext) {
    if (ctx.isSuperAdmin) {
      return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const ids = Object.keys(ctx.memberships);
    return this.prisma.organization.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: AuthContext, organizationId: string) {
    assertOrganizationAccess(ctx, organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw notFound('Organização não encontrada.');
    return org;
  }

  /** Cria uma organização; o criador entra como ORGANIZATION_ADMIN. */
  async create(ctx: AuthContext, input: CreateOrganizationInput) {
    const base = input.slug ? slugify(input.slug) : slugify(input.name);
    const slug = await uniqueSlug(this.prisma, base);

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: input.name, slug } });
      await tx.organizationUser.create({
        data: { organizationId: org.id, userId: ctx.userId, role: 'ORGANIZATION_ADMIN' },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: ctx.userId,
          action: 'ORGANIZATION_CREATED',
          entityType: 'organization',
          entityId: org.id,
        },
      });
      return org;
    });
  }

  async update(ctx: AuthContext, organizationId: string, input: UpdateOrganizationInput) {
    assertPermission(ctx, organizationId, 'org:manage');
    await this.get(ctx, organizationId); // garante existência + acesso
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: input.name },
    });
  }

  // --- membros -------------------------------------------------------------

  async listMembers(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'org:manage');
    return this.prisma.organizationUser.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Convida (ou adiciona) um usuário existente à organização com um papel. */
  async inviteMember(ctx: AuthContext, organizationId: string, input: InviteMemberInput) {
    assertPermission(ctx, organizationId, 'org:manage');
    // Apenas SUPER_ADMIN do SaaS pode conceder papel SUPER_ADMIN (spec §34).
    if (input.role === 'SUPER_ADMIN' && !ctx.isSuperAdmin) {
      throw badRequest('Somente administradores do SaaS podem conceder SUPER_ADMIN.');
    }
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw notFound('Usuário não encontrado. Peça que crie uma conta primeiro.');

    const existing = await this.prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    if (existing) throw conflict('Usuário já é membro desta organização.');

    const membership = await this.prisma.organizationUser.create({
      data: { organizationId, userId: user.id, role: input.role },
    });
    await this.audit(ctx, organizationId, 'MEMBER_ADDED', 'organization_user', membership.id);
    return membership;
  }

  async updateMemberRole(
    ctx: AuthContext,
    organizationId: string,
    membershipId: string,
    input: UpdateMemberRoleInput,
  ) {
    assertPermission(ctx, organizationId, 'org:manage');
    const membership = await this.prisma.organizationUser.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw notFound('Associação não encontrada.');
    if (input.role === 'SUPER_ADMIN' && !ctx.isSuperAdmin) {
      throw badRequest('Somente administradores do SaaS podem conceder SUPER_ADMIN.');
    }
    const updated = await this.prisma.organizationUser.update({
      where: { id: membership.id },
      data: { role: input.role },
    });
    await this.audit(ctx, organizationId, 'MEMBER_ROLE_CHANGED', 'organization_user', updated.id);
    return updated;
  }

  async removeMember(ctx: AuthContext, organizationId: string, membershipId: string) {
    assertPermission(ctx, organizationId, 'org:manage');
    const membership = await this.prisma.organizationUser.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw notFound('Associação não encontrada.');
    if (membership.userId === ctx.userId) {
      throw badRequest('Você não pode remover a si mesmo da organização.');
    }
    await this.prisma.organizationUser.delete({ where: { id: membership.id } });
    await this.audit(ctx, organizationId, 'MEMBER_REMOVED', 'organization_user', membershipId);
  }

  private async audit(
    ctx: AuthContext,
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId: ctx.userId, action, entityType, entityId },
    });
  }
}
