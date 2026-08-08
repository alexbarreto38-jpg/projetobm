/**
 * RBAC do painel (spec §34). As strings coincidem com o enum `Role` do Prisma.
 */
export const ROLES = ['SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;
export type RoleName = (typeof ROLES)[number];

/**
 * Permissões granulares. As telas e endpoints checam permissões, não papéis
 * diretamente — assim mudanças de política não exigem varredura no código.
 */
export const PERMISSIONS = [
  'org:manage', // administrar organização, membros, configurações
  'saas:manage', // administrar o SaaS inteiro (somente SUPER_ADMIN)
  'connection:read',
  'connection:manage', // conectar/desconectar Meta, rotacionar credenciais
  'account:read',
  'account:sync',
  'template:read',
  'template:write', // criar/editar/replicar templates
  'contact:read',
  'contact:write', // importar/gerir contatos, opt-in/opt-out
  'campaign:read',
  'campaign:write', // criar/editar campanhas
  'campaign:execute', // iniciar/pausar/cancelar campanhas
  'report:read',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Matriz papel -> permissões. Fonte única de verdade para autorização no
 * backend. NUNCA confiar apenas no frontend para isolamento (spec §10).
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  ORGANIZATION_ADMIN: [
    'org:manage',
    'connection:read',
    'connection:manage',
    'account:read',
    'account:sync',
    'template:read',
    'template:write',
    'contact:read',
    'contact:write',
    'campaign:read',
    'campaign:write',
    'campaign:execute',
    'report:read',
    'audit:read',
  ],
  MANAGER: [
    'connection:read',
    'account:read',
    'account:sync',
    'template:read',
    'template:write',
    'contact:read',
    'contact:write',
    'campaign:read',
    'campaign:write',
    'campaign:execute',
    'report:read',
  ],
  OPERATOR: [
    'connection:read',
    'account:read',
    'template:read',
    'contact:read',
    'contact:write',
    'campaign:read',
    'campaign:execute',
    'report:read',
  ],
  VIEWER: [
    'connection:read',
    'account:read',
    'template:read',
    'contact:read',
    'campaign:read',
    'report:read',
  ],
};

export function hasPermission(role: RoleName, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
