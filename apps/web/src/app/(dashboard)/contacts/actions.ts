'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export async function createContactAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const res = await api(`/api/organizations/${orgId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      phone: String(formData.get('phone') ?? ''),
      name: String(formData.get('name') ?? '') || undefined,
    }),
  });
  if (!res.ok) return res.error ?? 'Falha ao criar contato.';
  revalidatePath('/contacts');
  return null;
}

export async function importContactsAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const csv = String(formData.get('csv') ?? '').trim();
  if (!csv) return 'Cole o conteúdo do CSV.';
  const res = await api(`/api/organizations/${orgId}/contacts/import`, {
    method: 'POST',
    body: JSON.stringify({ csv, filename: 'colado.csv' }),
  });
  if (!res.ok) return res.error ?? 'Falha ao importar.';
  revalidatePath('/contacts');
  return null;
}

export async function optOutAction(orgId: string, contactId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/contacts/${contactId}/optout`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'painel' }),
  });
  revalidatePath('/contacts');
}

export async function removeOptOutAction(orgId: string, contactId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/contacts/${contactId}/optout`, { method: 'DELETE' });
  revalidatePath('/contacts');
}
