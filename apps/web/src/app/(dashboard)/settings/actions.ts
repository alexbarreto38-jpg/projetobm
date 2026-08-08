'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export async function purgeDataAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const olderThanDays = Number(formData.get('olderThanDays') ?? 0);
  if (!olderThanDays || olderThanDays < 1) return 'Informe um período válido.';
  const res = await api<{ deleted: { messages: number } }>(
    `/api/organizations/${orgId}/data-purge`,
    { method: 'POST', body: JSON.stringify({ olderThanDays }) },
  );
  if (!res.ok) return res.error ?? 'Falha ao purgar.';
  revalidatePath('/settings');
  return `Purga concluída: ${res.data?.deleted.messages ?? 0} mensagens removidas.`;
}

export async function deleteOrgAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const confirmSlug = String(formData.get('confirmSlug') ?? '');
  const res = await api(`/api/organizations/${orgId}/data`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmSlug }),
  });
  if (!res.ok) return res.error ?? 'Falha ao excluir.';
  redirect('/login');
}
