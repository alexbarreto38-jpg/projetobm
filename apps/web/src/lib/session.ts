import { cookies } from 'next/headers';
import { api, SESSION_COOKIE } from './api';

export interface Me {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  memberships: Record<string, string>;
}

/** Busca o usuário atual pela sessão. Retorna null se não autenticado. */
export async function getMe(): Promise<Me | null> {
  const res = await api<{ user: Me }>('/api/auth/me');
  return res.ok && res.data ? res.data.user : null;
}

/** Organização "atual" (primeira associação). Base multi-tenant do painel. */
export function currentOrgId(me: Me): string | null {
  const ids = Object.keys(me.memberships);
  return ids[0] ?? null;
}

export function hasSession(): boolean {
  return Boolean(cookies().get(SESSION_COOKIE)?.value);
}

/** Contexto da página: usuário atual + organização selecionada. */
export async function getOrgContext(): Promise<{ me: Me; orgId: string | null } | null> {
  const me = await getMe();
  if (!me) return null;
  return { me, orgId: currentOrgId(me) };
}
