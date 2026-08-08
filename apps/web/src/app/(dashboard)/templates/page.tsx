import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  deploymentSummary?: Record<string, number>;
}

export default async function TemplatesPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ templates: Template[] }>(`/api/organizations/${ctx.orgId}/templates`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar os templates: ${res.error}`} />;
  const templates = res.data?.templates ?? [];

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Templates mestres e o status das implantações por conta (Bulk Template Manager)."
        action={
          <Link href="/templates/new">
            <Button>Novo template</Button>
          </Link>
        }
      />
      {templates.length === 0 ? (
        <EmptyState
          title="Nenhum template"
          description="Crie um template e replique-o para múltiplas contas autorizadas."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Categoria</Th>
              <Th>Idioma</Th>
              <Th>Aprovados</Th>
              <Th>Pendentes</Th>
              <Th>Rejeitados</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const s = t.deploymentSummary ?? {};
              return (
                <tr key={t.id}>
                  <Td>
                    <Link href={`/templates/${t.id}`} className="text-wise-yellow hover:underline">
                      {t.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge>{t.category}</Badge>
                  </Td>
                  <Td>{t.language}</Td>
                  <Td>
                    <span className="text-green-400">{s.APPROVED ?? 0}</span>
                  </Td>
                  <Td>
                    <span className="text-wise-yellow">{s.PENDING ?? 0}</span>
                  </Td>
                  <Td>
                    <span className="text-red-400">{(s.REJECTED ?? 0) + (s.ERROR ?? 0)}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
