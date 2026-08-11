import { replicateTemplateAction } from '../actions';
import { Badge, statusTone } from '@/components/ui/badge';
import { SubmitButton } from '@/components/form';
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
}
interface Account {
  id: string;
  name?: string;
  externalAccountId: string;
}
interface Deployment {
  id: string;
  status: string;
  externalTemplateId?: string | null;
  errorMessage?: string | null;
  targetAccount?: { name?: string; externalAccountId: string };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: { templateId: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;
  const templateId = params.templateId;

  const [tplRes, accRes, depRes] = await Promise.all([
    api<{ template: Template }>(`/api/organizations/${orgId}/templates/${templateId}`),
    api<{ accounts: Account[] }>(`/api/organizations/${orgId}/meta/accounts`),
    api<{ deployments: Deployment[] }>(
      `/api/organizations/${orgId}/templates/${templateId}/deployments`,
    ),
  ]);
  if (!tplRes.ok) return <ErrorState message={`Template não encontrado: ${tplRes.error}`} />;
  const tpl = tplRes.data!.template;
  const accounts = accRes.data?.accounts ?? [];
  const deployments = depRes.data?.deployments ?? [];

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title={tpl.name}
          description={`${tpl.category} · ${tpl.language} · ${tpl.status}`}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-wise-muted">Replicar para contas</h2>
        {accounts.length === 0 ? (
          <EmptyState title="Nenhuma conta conectada" description="Conecte uma conta Meta para replicar." />
        ) : (
          <form
            action={replicateTemplateAction.bind(null, orgId, templateId)}
            className="rounded-xl border border-wise-border bg-wise-surface p-5"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="accountIds" value={a.id} className="accent-wise-yellow" />
                  {a.name ?? a.externalAccountId}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <SubmitButton pendingLabel="Enfileirando…">Replicar</SubmitButton>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-wise-muted">Implantações por conta</h2>
        {deployments.length === 0 ? (
          <EmptyState title="Nenhuma implantação" description="Replique o template para acompanhar o status por conta." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Conta</Th>
                <Th>Status</Th>
                <Th>ID externo</Th>
                <Th>Erro</Th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <Td>{d.targetAccount?.name ?? d.targetAccount?.externalAccountId ?? '—'}</Td>
                  <Td>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </Td>
                  <Td>
                    <span className="text-wise-muted">{d.externalTemplateId ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-red-400">{d.errorMessage ?? '—'}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
