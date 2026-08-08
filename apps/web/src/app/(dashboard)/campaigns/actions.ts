'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export async function createCampaignAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const accountIds = formData.getAll('accountIds').map(String).filter(Boolean);
  if (accountIds.length === 0) return 'Selecione ao menos uma conta.';
  const payload = {
    name: String(formData.get('name') ?? ''),
    templateId: String(formData.get('templateId') ?? ''),
    accountIds,
  };
  const res = await api<{ campaign: { id: string } }>(`/api/organizations/${orgId}/campaigns`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return res.error ?? 'Falha ao criar campanha.';
  redirect(`/campaigns/${res.data!.campaign.id}`);
}

export async function startCampaignAction(orgId: string, campaignId: string): Promise<void> {
  // Reconhece avisos do preflight; BLOCKED continua barrado no backend (§24).
  await api(`/api/organizations/${orgId}/campaigns/${campaignId}/start`, {
    method: 'POST',
    body: JSON.stringify({ acknowledgeWarnings: true }),
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function pauseCampaignAction(orgId: string, campaignId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/campaigns/${campaignId}/pause`, { method: 'POST' });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function cancelCampaignAction(orgId: string, campaignId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/campaigns/${campaignId}/cancel`, { method: 'POST' });
  revalidatePath(`/campaigns/${campaignId}`);
}
