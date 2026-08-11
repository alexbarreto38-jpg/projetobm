import { NewCampaignForm } from './form';
import { createCampaignAction } from '../actions';
import { ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;
  const orgId = ctx.orgId;

  const [tplRes, accRes] = await Promise.all([
    api<{ templates: { id: string; name: string; language: string }[] }>(
      `/api/organizations/${orgId}/templates`,
    ),
    api<{ accounts: { id: string; name?: string; externalAccountId: string }[] }>(
      `/api/organizations/${orgId}/meta/accounts`,
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Nova campanha"
        description="Escolha o template e as contas. O preflight de compliance roda antes do envio."
      />
      <NewCampaignForm
        action={createCampaignAction.bind(null, orgId)}
        templates={tplRes.data?.templates ?? []}
        accounts={accRes.data?.accounts ?? []}
      />
    </div>
  );
}
