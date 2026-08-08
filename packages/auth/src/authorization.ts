import {
  hasPermission,
  ROLE_PERMISSIONS,
  type Permission,
  type RoleName,
} from '@wise/types';

/**
 * Autorização (spec §10, §34). O contexto é montado no backend a cada request:
 * quem é o usuário, se é super admin, e seu papel em CADA organização a que
 * pertence. NUNCA confiar no frontend para isolamento.
 */
export interface AuthContext {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  /** organizationId -> papel do usuário naquela organização. */
  memberships: Record<string, RoleName>;
}

export class AuthorizationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
  }
}

/** O usuário pertence à organização? Super admin acessa todas. */
export function canAccessOrganization(ctx: AuthContext, organizationId: string): boolean {
  if (ctx.isSuperAdmin) return true;
  return organizationId in ctx.memberships;
}

/** Papel efetivo do usuário na organização (super admin conta como SUPER_ADMIN). */
export function roleIn(ctx: AuthContext, organizationId: string): RoleName | null {
  if (ctx.isSuperAdmin) return 'SUPER_ADMIN';
  return ctx.memberships[organizationId] ?? null;
}

/** O usuário tem a permissão na organização? */
export function can(
  ctx: AuthContext,
  organizationId: string,
  permission: Permission,
): boolean {
  const role = roleIn(ctx, organizationId);
  if (!role) return false;
  return hasPermission(role, permission);
}

/**
 * Garante acesso à organização OU lança AuthorizationError (403). Use na
 * fronteira de cada handler antes de tocar em dados do tenant.
 */
export function assertOrganizationAccess(ctx: AuthContext, organizationId: string): void {
  if (!canAccessOrganization(ctx, organizationId)) {
    throw new AuthorizationError('Sem acesso a esta organização.', 404);
    // 404 (e não 403) para não revelar a existência de tenants alheios.
  }
}

/** Garante a permissão na organização OU lança AuthorizationError. */
export function assertPermission(
  ctx: AuthContext,
  organizationId: string,
  permission: Permission,
): void {
  assertOrganizationAccess(ctx, organizationId);
  if (!can(ctx, organizationId, permission)) {
    throw new AuthorizationError(
      `Permissão insuficiente (${permission}) nesta organização.`,
    );
  }
}

/** Garante que o usuário é super admin do SaaS (spec §34). */
export function assertSuperAdmin(ctx: AuthContext): void {
  if (!ctx.isSuperAdmin) {
    throw new AuthorizationError('Ação restrita a administradores do SaaS.');
  }
}

export { ROLE_PERMISSIONS };
