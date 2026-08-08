import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { currentOrgId, getMe } from '@/lib/session';

/**
 * Baixa a exportação de dados da organização (LGPD §44). Roda server-side,
 * encaminhando o cookie de sessão; o token nunca vai ao browser.
 */
export async function GET() {
  const me = await getMe();
  const orgId = me ? currentOrgId(me) : null;
  if (!orgId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const res = await api<unknown>(`/api/organizations/${orgId}/data-export`);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status || 500 });

  return new NextResponse(JSON.stringify(res.data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="export-${orgId}.json"`,
    },
  });
}
