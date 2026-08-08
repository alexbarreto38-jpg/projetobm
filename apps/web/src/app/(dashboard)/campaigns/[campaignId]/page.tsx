import { cancelCampaignAction, pauseCampaignAction, startCampaignAction } from '../actions';
import { Badge, statusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  name: string;
  status: string;
}
interface Check {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}
interface Preflight {
  result: 'READY' | 'WARNING' | 'BLOCKED';
  checks: Check[];
  audience: { total: number; optedOut: number; missingConsent: number; eligible: number };
}

const checkIcon = (s: string) => (s === 'pass' ? '🟢' : s === 'warn' ? '🟡' : '🔴');

export default async function CampaignDetailPage({
  params,
}: {
  params: { campaignId: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;
  const campaignId = params.campaignId;

  const [cRes, pRes] = await Promise.all([
    api<{ campaign: Campaign }>(`/api/organizations/${orgId}/campaigns/${campaignId}`),
    api<{ preflight: Preflight }>(`/api/organizations/${orgId}/campaigns/${campaignId}/preflight`),
  ]);
  if (!cRes.ok) return <ErrorState message={`Campanha não encontrada: ${cRes.error}`} />;
  const campaign = cRes.data!.campaign;
  const pf = pRes.data?.preflight;

  const canStart = ['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status) && pf?.result !== 'BLOCKED';
  const canPause = campaign.status === 'RUNNING';
  const canCancel = !['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status);

  return (
    <div className="space-y-8">
      <PageHeader
        title={campaign.name}
        action={<Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>}
      />

      {pf ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Preflight de compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Badge tone={statusTone(pf.result)}>{pf.result}</Badge>
              </div>
              <ul className="space-y-1.5 text-sm">
                {pf.checks.map((c) => (
                  <li key={c.check} className="flex items-center gap-2">
                    <span>{checkIcon(c.status)}</span>
                    <span>{c.check}</span>
                    {c.detail ? <span className="text-wise-muted">— {c.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Público</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Total" value={pf.audience.total} />
              <Row label="Opt-out" value={pf.audience.optedOut} />
              <Row label="Sem consentimento" value={pf.audience.missingConsent} />
              <Row label="Elegíveis" value={pf.audience.eligible} highlight />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="flex gap-2">
        {canStart ? (
          <form action={startCampaignAction.bind(null, orgId, campaignId)}>
            <Button type="submit">Iniciar / agendar</Button>
          </form>
        ) : null}
        {canPause ? (
          <form action={pauseCampaignAction.bind(null, orgId, campaignId)}>
            <Button variant="outline" type="submit">
              Pausar
            </Button>
          </form>
        ) : null}
        {canCancel ? (
          <form action={cancelCampaignAction.bind(null, orgId, campaignId)}>
            <Button variant="danger" type="submit">
              Cancelar
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-wise-muted">{label}</span>
      <span className={highlight ? 'font-semibold text-wise-yellow' : ''}>{value}</span>
    </div>
  );
}
