import { Card, CardContent } from '@/components/ui/card';
import { ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Check {
  ok: boolean;
  detail?: string;
}
interface Health {
  connection: Check;
  permission: Check;
  account: Check;
  number: Check;
  webhook: Check;
  templates: Check;
  lastCheckedAt: string;
}

const LABELS: Record<string, string> = {
  connection: 'Conexão',
  permission: 'Permissão',
  account: 'Conta',
  number: 'Número',
  webhook: 'Webhook',
  templates: 'Templates',
};

export default async function AccountHealthPage({
  params,
}: {
  params: { accountId: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ health: Health }>(
    `/api/organizations/${ctx.orgId}/meta/accounts/${params.accountId}/health`,
  );
  if (!res.ok) return <ErrorState message={`Não foi possível carregar a saúde: ${res.error}`} />;
  const h = res.data!.health;
  const items = (['connection', 'permission', 'account', 'number', 'webhook', 'templates'] as const).map(
    (k) => ({ key: k, label: LABELS[k]!, check: h[k] }),
  );

  return (
    <div>
      <PageHeader
        title="Diagnóstico da conta"
        description={`Última verificação: ${new Date(h.lastCheckedAt).toLocaleString('pt-BR')}`}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Card key={i.key}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{i.label}</div>
                {i.check.detail ? <div className="text-xs text-wise-muted">{i.check.detail}</div> : null}
              </div>
              <span className="text-xl">{i.check.ok ? '🟢' : '🔴'}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
