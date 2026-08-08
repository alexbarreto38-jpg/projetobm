import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default async function ReportsPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ report: Report }>(`/api/organizations/${ctx.orgId}/reports/messages`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar os relatórios: ${res.error}`} />;
  const r = res.data!.report;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Funil de mensagens e taxas de entrega, leitura e falha."
      />
      {r.counts.total === 0 ? (
        <EmptyState
          title="Nenhuma mensagem ainda"
          description="Inicie uma campanha para ver os números aqui."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total" value={r.counts.total} />
            <Stat label="Enviadas" value={r.counts.sent} />
            <Stat label="Entregues" value={r.counts.delivered} tone="text-green-400" />
            <Stat label="Lidas" value={r.counts.read} tone="text-green-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
