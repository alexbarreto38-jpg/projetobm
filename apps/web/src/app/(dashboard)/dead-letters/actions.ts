'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export async function requeueAction(orgId: string, entryId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/dead-letters/${entryId}/requeue`, { method: 'POST' });
  revalidatePath('/dead-letters');
}

export async function dismissAction(orgId: string, entryId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/dead-letters/${entryId}/dismiss`, { method: 'POST' });
  revalidatePath('/dead-letters');
}
