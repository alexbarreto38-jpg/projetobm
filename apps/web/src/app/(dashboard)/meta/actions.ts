'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

/**
 * Conexão por token de System User (uso administrativo). O fluxo oficial e
 * preferido é o Embedded Signup — cujo callback server-side já existe na API.
 * O token é enviado ao backend e cifrado no CredentialVault; nunca fica no
 * navegador além do envio deste formulário (spec §7, §8).
 */
export async function connectByTokenAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const payload = {
    accessToken: String(formData.get('accessToken') ?? ''),
    wabaId: String(formData.get('wabaId') ?? ''),
  };
  const res = await api(`/api/organizations/${orgId}/meta/connections/token`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return res.error ?? 'Falha ao conectar a conta.';
  revalidatePath('/meta/accounts');
  return null;
}

export async function syncAccountAction(orgId: string, accountId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/meta/accounts/${accountId}/sync`, { method: 'POST' });
  revalidatePath('/meta/accounts');
}
