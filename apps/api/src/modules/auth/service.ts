import { hashPassword, verifyPassword, type SessionPayload } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import type { LoginInput, SignupInput } from '@wise/validation';
import { conflict, unauthorized } from '../../lib/errors.js';
import { slugify, uniqueSlug } from '../organizations/slug.js';

/**
 * AuthService — registro e login (spec §1, §34).
 * O registro cria, em transação: usuário + organização + associação
 * ORGANIZATION_ADMIN. Assim todo dono de conta administra a própria empresa.
 */
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: SignupInput): Promise<SessionPayload> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('E-mail já cadastrado.');

    const passwordHash = await hashPassword(input.password);
    const baseSlug = slugify(input.organizationName);
    const slug = await uniqueSlug(this.prisma, baseSlug);

    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      await tx.organizationUser.create({
        data: { organizationId: org.id, userId: created.id, role: 'ORGANIZATION_ADMIN' },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: created.id,
          action: 'USER_REGISTERED',
          entityType: 'organization',
          entityId: org.id,
        },
      });
      return created;
    });

    return { sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin };
  }

  async login(input: LoginInput): Promise<SessionPayload> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Mensagem genérica para não revelar se o e-mail existe (spec §47).
    const genericError = unauthorized('E-mail ou senha inválidos.');
    if (!user?.passwordHash) throw genericError;

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw genericError;

    return { sub: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin };
  }
}
