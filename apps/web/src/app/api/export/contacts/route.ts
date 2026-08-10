import { NextResponse } from 'next/server';
import { apiRaw } from '@/lib/api';
import { currentOrgId, getMe } from '@/lib/session';

/**
 * Baixa os contatos da organização em CSV (spec §40). Roda server-side,
 * encaminhando o cookie; o token nunca vai ao browser.
 */
export async function GET() {
  const me = await getMe();
  const orgId = me ? currentOrgId(me) : null;
  if (!orgId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const res = await apiRaw(`/api/organizations/${orgId}/contacts/export.csv`);
  if (!res.ok) {
    return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status || 500 });
  }
  const csv = await res.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="contatos-${orgId}.csv"`,
    },
  });
}
