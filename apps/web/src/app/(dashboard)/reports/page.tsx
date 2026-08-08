import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Report {
  counts: {
    total: number;
    queued: number;
    processing: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  rates: { delivery: number; read: number; failure: number };
}
interface Campaign {
  id: string;
  name: string;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-semibold ${tone ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; campaignId?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;

  const query = new URLSearchParams();
  if (searchParams.from) query.set('from', new Date(searchParams.from).toISOString());
  if (searchParams.to) query.set('to', new Date(searchParams.to).toISOString());
  if (searchParams.campaignId) query.set('campaignId', searchParams.campaignId);

  const [repRes, campRes] = await Promise.all([
    api<{ report: Report }>(`/api/organizations/${orgId}/reports/messages?${query.toString()}`),
    api<{ campaigns: Campaign[] }>(`/api/organizations/${orgId}/campaigns`),
  ]);
  if (!repRes.ok) return <ErrorState message={`Não foi possível carregar os relatórios: ${repRes.error}`} />;
  const r = repRes.data!.report;
  const campaigns = campRes.data?.campaigns ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Funil de mensagens e taxas de entrega, leitura e falha." />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-wise-border bg-wise-surface p-4">
        <div className="space-y-1.5">
          <Label htmlFor="from">De</Label>
          <Input id="from" name="from" type="date" defaultValue={searchParams.from} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={searchParams.to} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campaignId">Campanha</Label>
          <select
            id="campaignId"
            name="campaignId"
            defaultValue={searchParams.campaignId ?? ''}
            className="h-10 w-56 rounded-lg border border-wise-border bg-wise-bg px-3 text-sm text-wise-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
          >
            <option value="">Todas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {r.counts.total === 0 ? (
        <EmptyState title="Nenhuma mensagem no filtro" description="Ajuste os filtros ou inicie uma campanha." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total" value={r.counts.total} />
            <Stat label="Enviadas" value={r.counts.sent} />
            <Stat label="Entregues" value={r.counts.delivered} tone="text-green-400" />
            <Stat label="Lidas" value={r.counts.read} tone="text-green-400" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Falhas" value={r.counts.failed} tone="text-red-400" />
            <Stat label="Pendentes" value={r.counts.queued + r.counts.processing} />
            <Stat label="Taxa de entrega" value={pct(r.rates.delivery)} />
            <Stat label="Taxa de falha" value={pct(r.rates.failure)} tone="text-red-400" />
          </div>
        </>
      )}
    </div>
  );
}
