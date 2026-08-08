import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Contact {
  id: string;
  phone: string;
  name?: string;
  isOptedOut: boolean;
  consentTypes: string[];
}

export default async function ContactsPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ contacts: Contact[] }>(`/api/organizations/${ctx.orgId}/contacts`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar os contatos: ${res.error}`} />;
  const contacts = res.data?.contacts ?? [];

  return (
    <div>
      <PageHeader
        title="Contatos"
        description="Contatos normalizados (E.164), com consentimento e opt-out por organização."
      />
      {contacts.length === 0 ? (
        <EmptyState
          title="Nenhum contato"
          description="Importe um CSV ou cadastre contatos com opt-in registrado."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Telefone</Th>
              <Th>Nome</Th>
              <Th>Consentimento</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <Td>{c.phone}</Td>
                <Td>{c.name ?? '—'}</Td>
                <Td>
                  {c.consentTypes.length > 0 ? (
                    <div className="flex gap-1">
                      {c.consentTypes.map((t) => (
                        <Badge key={t} tone="success">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-wise-muted">—</span>
                  )}
                </Td>
                <Td>
                  {c.isOptedOut ? <Badge tone="danger">Opt-out</Badge> : <Badge tone="success">Ativo</Badge>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
