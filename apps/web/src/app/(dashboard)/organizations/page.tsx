import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Org {
  id: string;
  name: string;
  slug: string;
  isRoot: boolean;
  createdAt: string;
}

export default async function OrganizationsPage() {
  const res = await api<{ organizations: Org[] }>('/api/organizations');
  if (!res.ok) return <ErrorState message={`Não foi possível carregar as empresas: ${res.error}`} />;
  const orgs = res.data?.organizations ?? [];

  return (
    <div>
      <PageHeader title="Empresas" description="Clientes e organizações do SaaS (multi-tenant)." />
      {orgs.length === 0 ? (
        <EmptyState title="Nenhuma empresa" description="As organizações a que você pertence aparecem aqui." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Slug</Th>
              <Th>Tipo</Th>
              <Th>Criada em</Th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <Td>{o.name}</Td>
                <Td>
                  <span className="text-wise-muted">{o.slug}</span>
                </Td>
                <Td>{o.isRoot ? <Badge tone="warning">Raiz (SaaS)</Badge> : <Badge>Cliente</Badge>}</Td>
                <Td>{new Date(o.createdAt).toLocaleDateString('pt-BR')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
