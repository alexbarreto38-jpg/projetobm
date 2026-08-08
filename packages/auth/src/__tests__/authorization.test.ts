import { describe, expect, it } from 'vitest';
import {
  assertOrganizationAccess,
  assertPermission,
  assertSuperAdmin,
  AuthorizationError,
  can,
  canAccessOrganization,
  roleIn,
  type AuthContext,
} from '../authorization.js';

const member: AuthContext = {
  userId: 'u1',
  email: 'm@x.com',
  isSuperAdmin: false,
  memberships: { org_a: 'MANAGER', org_b: 'VIEWER' },
};

const superAdmin: AuthContext = {
  userId: 'root',
  email: 'root@x.com',
  isSuperAdmin: true,
  memberships: {},
};

describe('authorization', () => {
  it('isola tenants: sem acesso a organização não pertencida', () => {
    expect(canAccessOrganization(member, 'org_a')).toBe(true);
    expect(canAccessOrganization(member, 'org_z')).toBe(false);
  });

  it('super admin acessa qualquer organização', () => {
    expect(canAccessOrganization(superAdmin, 'org_z')).toBe(true);
    expect(roleIn(superAdmin, 'org_z')).toBe('SUPER_ADMIN');
  });

  it('MANAGER pode escrever templates, VIEWER não', () => {
    expect(can(member, 'org_a', 'template:write')).toBe(true);
    expect(can(member, 'org_b', 'template:write')).toBe(false);
    expect(can(member, 'org_b', 'template:read')).toBe(true);
  });

  it('assertOrganizationAccess lança 404 para tenant alheio (não revela existência)', () => {
    expect(() => assertOrganizationAccess(member, 'org_z')).toThrow(AuthorizationError);
    try {
      assertOrganizationAccess(member, 'org_z');
    } catch (e) {
      expect((e as AuthorizationError).statusCode).toBe(404);
    }
  });

  it('assertPermission lança 403 quando papel insuficiente', () => {
    try {
      assertPermission(member, 'org_b', 'template:write');
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError);
      expect((e as AuthorizationError).statusCode).toBe(403);
    }
  });

  it('assertSuperAdmin bloqueia não-super-admin', () => {
    expect(() => assertSuperAdmin(member)).toThrow(AuthorizationError);
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow();
  });
});
