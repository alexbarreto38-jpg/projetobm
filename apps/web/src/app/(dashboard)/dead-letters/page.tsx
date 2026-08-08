import { dismissAction, requeueAction } from './actions';
import { Badge } from '@/components/ui/badge';
import { SubmitButton } from '@/components/form';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Entry {
  id: string;
  queue: string;
  reason: string;
  createdAt: string;
}

export default async function DeadLettersPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;

  const res = await api<{ deadLetters: Entry[] }>(`/api/organizations/${orgId}/dead-letters`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar: ${res.error}`} />;
  const entries = res.data?.deadLetters ?? [];

  return (
    <div>
      <PageHeader
        title="Dead-letter"
        description="Jobs que falharam definitivamente. O reprocessamento re-executa a validação (não é reenvio cego)."
      />
      {entries.length === 0 ? (
        <EmptyState title="Nada na dead-letter" description="Jobs esgotados aparecerão aqui para inspeção." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Fila</Th>
              <Th>Motivo</Th>
              <Th>Data</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Badge>{e.queue}</Badge>
                </Td>
                <Td>
                  <span className="text-red-400">{e.reason}</span>
                </Td>
                <Td>{new Date(e.createdAt).toLocaleString('pt-BR')}</Td>
                <Td>
                  <div className="flex gap-2">
                    <form action={requeueAction.bind(null, orgId, e.id)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel="…">
                        Reprocessar
                      </SubmitButton>
                    </form>
                    <form action={dismissAction.bind(null, orgId, e.id)}>
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                        Descartar
                      </SubmitButton>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
