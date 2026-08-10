import { NextResponse } from 'next/server';
import { apiRaw } from '@/lib/api';
import { currentOrgId, getMe } from '@/lib/session';

/**
 * Baixa o relatório de mensagens em CSV (spec §32). Repassa os filtros da query
 * (from/to/campaignId/phoneNumberId) para a API. Roda server-side.
 */
export async function GET(request: Request) {
  const me = await getMe();
  const orgId = me ? currentOrgId(me) : null;
  if (!orgId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const qs = new URL(request.url).searchParams.toString();
  const suffix = qs ? `?${qs}` : '';
  const res = await apiRaw(`/api/organizations/${orgId}/reports/messages/export.csv${suffix}`);
  if (!res.ok) {
    return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status || 500 });
  }
  const csv = await res.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relatorio-mensagens-${orgId}.csv"`,
    },
  });
}
