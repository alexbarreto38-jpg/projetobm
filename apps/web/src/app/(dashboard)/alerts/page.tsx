import { acknowledgeAlert, resolveAlert } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Alert {
  id: string;
  severity: string;
  status: string;
  code: string;
  title: string;
  detail?: string;
  createdAt: string;
}

const severityTone = (s: string) =>
  s === 'CRITICAL' ? 'danger' : s === 'WARNING' ? 'warning' : 'info';

export default async function AlertsPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;

  const res = await api<{ alerts: Alert[] }>(`/api/organizations/${orgId}/alerts`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar os alertas: ${res.error}`} />;
  const alerts = res.data?.alerts ?? [];

  return (
    <div>
      <PageHeader
        title="Alertas"
        description="Conexões que requerem atenção, números restritos, templates rejeitados e saúde de webhooks."
      />
      {alerts.length === 0 ? (
        <EmptyState
          title="Sem alertas abertos"
          description="Alertas do sistema aparecerão aqui quando algo precisar de atenção."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-wise-border bg-wise-surface p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
                  <span className="font-medium">{a.title}</span>
                  {a.status === 'ACKNOWLEDGED' ? <Badge>reconhecido</Badge> : null}
                </div>
                {a.detail ? <p className="mt-1 text-sm text-wise-muted">{a.detail}</p> : null}
                <p className="mt-1 text-xs text-wise-muted">
                  {a.code} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {a.status !== 'ACKNOWLEDGED' ? (
                  <form action={acknowledgeAlert.bind(null, orgId, a.id)}>
                    <Button variant="outline" size="sm" type="submit">
                      Reconhecer
                    </Button>
                  </form>
                ) : null}
                <form action={resolveAlert.bind(null, orgId, a.id)}>
                  <Button variant="ghost" size="sm" type="submit">
                    Resolver
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
