import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Pagination, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface AuditLog {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  createdAt: string;
  user?: { email?: string; name?: string };
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { cursor?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const cursor = searchParams.cursor;
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api<{ logs: AuditLog[]; nextCursor?: string | null }>(
    `/api/organizations/${ctx.orgId}/audit${query}`,
  );
  if (!res.ok) return <ErrorState message={`Não foi possível carregar a auditoria: ${res.error}`} />;
  const logs = res.data?.logs ?? [];

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro de ações sensíveis (quem fez o quê e quando)."
      />
      {logs.length === 0 ? (
        <EmptyState title="Sem registros" description="As ações sensíveis aparecerão aqui." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Ação</Th>
              <Th>Usuário</Th>
              <Th>Entidade</Th>
              <Th>Data</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td>
                  <Badge>{l.action}</Badge>
                </Td>
                <Td>{l.user?.email ?? '—'}</Td>
                <Td>
                  <span className="text-wise-muted">
                    {l.entityType ?? '—'}
                    {l.entityId ? ` · ${l.entityId.slice(0, 8)}…` : ''}
                  </span>
                </Td>
                <Td>{new Date(l.createdAt).toLocaleString('pt-BR')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pagination basePath="/audit" nextCursor={res.data?.nextCursor} hasCursor={!!cursor} />
    </div>
  );
}
