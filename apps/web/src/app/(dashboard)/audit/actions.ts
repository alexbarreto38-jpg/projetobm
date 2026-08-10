'use server';

import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export interface AuditLogItem {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  createdAt: string;
  user?: { email?: string; name?: string };
}

export interface AuditPage {
  logs: AuditLogItem[];
  nextCursor?: string | null;
}

/**
 * Busca a próxima página de auditoria (paginação por cursor). Chamada pelo
 * componente client "Carregar mais" via Server Action — o token de sessão
 * permanece no servidor (spec §8, §46), nada de chamar a API do navegador.
 */
export async function loadMoreAuditAction(cursor: string): Promise<AuditPage> {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return { logs: [], nextCursor: null };
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api<AuditPage>(`/api/organizations/${ctx.orgId}/audit${query}`);
  if (!res.ok) return { logs: [], nextCursor: null };
  return { logs: res.data?.logs ?? [], nextCursor: res.data?.nextCursor ?? null };
}
