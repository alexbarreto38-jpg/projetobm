import { deleteOrgAction, purgeDataAction } from './actions';
import { LgpdForms } from './lgpd-forms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { currentOrgId, getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Administrador do SaaS',
  ORGANIZATION_ADMIN: 'Administrador da empresa',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador',
  VIEWER: 'Visualizador',
};

interface Org {
  id: string;
  slug: string;
}

export default async function SettingsPage() {
  const me = await getMe();
  const orgId = me ? currentOrgId(me) : null;
  let slug = '';
  if (orgId) {
    const orgs = await api<{ organizations: Org[] }>('/api/organizations');
    slug = orgs.data?.organizations.find((o) => o.id === orgId)?.slug ?? '';
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Configurações" description="Conta, papéis e organizações." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{me?.email}</div>
            {me?.isSuperAdmin ? (
              <div className="text-wise-yellow">Administrador do SaaS</div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Papéis por organização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {me && Object.entries(me.memberships).length > 0 ? (
              Object.entries(me.memberships).map(([oid, role]) => (
                <div key={oid} className="flex justify-between">
                  <span className="text-wise-muted">{oid.slice(0, 8)}…</span>
                  <span>{ROLE_LABEL[role] ?? role}</span>
                </div>
              ))
            ) : (
              <span className="text-wise-muted">Sem organizações.</span>
            )}
          </CardContent>
        </Card>
      </div>

      {orgId ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-wise-muted">Dados &amp; LGPD</h2>
          <LgpdForms
            slug={slug}
            purgeAction={purgeDataAction.bind(null, orgId)}
            deleteAction={deleteOrgAction.bind(null, orgId)}
          />
        </section>
      ) : null}
    </div>
  );
}
