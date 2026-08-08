import Link from 'next/link';
import { Badge, statusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  name: string;
  status: string;
  preflightResult?: string | null;
  createdAt: string;
  template?: { name: string; category: string };
}

export default async function CampaignsPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ campaigns: Campaign[] }>(`/api/organizations/${ctx.orgId}/campaigns`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar as campanhas: ${res.error}`} />;
  const campaigns = res.data?.campaigns ?? [];

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Envios em massa com preflight de compliance e distribuição entre números autorizados."
        action={
          <Link href="/campaigns/new">
            <Button>Nova campanha</Button>
          </Link>
        }
      />
      {campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha"
          description="Crie uma campanha, rode o preflight e inicie o envio."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th>Preflight</Th>
              <Th>Criada em</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/campaigns/${c.id}`} className="text-wise-yellow hover:underline">
                    {c.name}
                  </Link>
                </Td>
                <Td>{c.template?.name ?? '—'}</Td>
                <Td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </Td>
                <Td>
                  {c.preflightResult ? (
                    <Badge tone={statusTone(c.preflightResult)}>{c.preflightResult}</Badge>
                  ) : (
                    <span className="text-wise-muted">—</span>
                  )}
                </Td>
                <Td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
