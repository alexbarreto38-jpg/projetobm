'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export async function createTemplateAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const body = String(formData.get('body') ?? '').trim();
  const payload = {
    name: String(formData.get('name') ?? ''),
    language: String(formData.get('language') ?? 'pt_BR'),
    category: String(formData.get('category') ?? 'UTILITY'),
    components: [{ type: 'BODY', text: body }],
  };
  const res = await api<{ template: { id: string } }>(
    `/api/organizations/${orgId}/templates`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  if (!res.ok) return res.error ?? 'Falha ao criar template.';
  redirect(`/templates/${res.data!.template.id}`);
}

export async function replicateTemplateAction(
  orgId: string,
  templateId: string,
  formData: FormData,
): Promise<void> {
  const accountIds = formData.getAll('accountIds').map(String).filter(Boolean);
  if (accountIds.length === 0) return;
  await api(`/api/organizations/${orgId}/templates/${templateId}/replicate`, {
    method: 'POST',
    body: JSON.stringify({ targetAccountIds: accountIds }),
  });
  revalidatePath(`/templates/${templateId}`);
}
