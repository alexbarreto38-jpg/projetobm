import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/page';
import { api } from '@/lib/api';
import { currentOrgId, getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Account {
  id: string;
  phoneNumbers?: { isPaused: boolean }[];
}
interface Template {
  deploymentSummary?: Record<string, number>;
}
interface Campaign {
  status: string;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint ? <div className="mt-1 text-xs text-wise-muted">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const me = await getMe();
  const orgId = me ? currentOrgId(me) : null;

  if (!orgId) {
    return (
      <ErrorState message="Nenhuma organização associada à sua conta. Crie uma em Empresas." />
    );
  }

  const [orgs, accounts, templates, campaigns] = await Promise.all([
    api<{ organizations: unknown[] }>('/api/organizations'),
    api<{ accounts: Account[] }>(`/api/organizations/${orgId}/meta/accounts`),
    api<{ templates: Template[] }>(`/api/organizations/${orgId}/templates`),
    api<{ campaigns: Campaign[] }>(`/api/organizations/${orgId}/campaigns`),
  ]);

  const accountList = accounts.data?.accounts ?? [];
  const activeNumbers = accountList.reduce(
    (acc, a) => acc + (a.phoneNumbers ?? []).filter((n) => !n.isPaused).length,
    0,
  );
  const approvedTemplates = (templates.data?.templates ?? []).reduce(
    (acc, t) => acc + (t.deploymentSummary?.APPROVED ?? 0),
    0,
  );
  const running = (campaigns.data?.campaigns ?? []).filter((c) => c.status === 'RUNNING').length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Wise API Manager</h1>
        <p className="text-sm text-wise-muted">Central de Mensageria</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Empresas" value={orgs.data?.organizations.length ?? 0} />
        <Stat label="Contas conectadas" value={accountList.length} />
        <Stat label="Números ativos" value={activeNumbers} hint="não pausados" />
        <Stat label="Templates aprovados" value={approvedTemplates} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Campanhas em execução" value={running} />
      </div>

      {!accounts.ok ? (
        <div className="mt-6">
          <ErrorState message={`Não foi possível carregar as contas Meta: ${accounts.error}`} />
        </div>
      ) : null}
    </div>
  );
}
