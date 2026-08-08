import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page';
import { getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Administrador do SaaS',
  ORGANIZATION_ADMIN: 'Administrador da empresa',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador',
  VIEWER: 'Visualizador',
};

export default async function SettingsPage() {
  const me = await getMe();

  return (
    <div>
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
              Object.entries(me.memberships).map(([orgId, role]) => (
                <div key={orgId} className="flex justify-between">
                  <span className="text-wise-muted">{orgId.slice(0, 8)}…</span>
                  <span>{ROLE_LABEL[role] ?? role}</span>
                </div>
              ))
            ) : (
              <span className="text-wise-muted">Sem organizações.</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
