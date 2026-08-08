'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export async function acknowledgeAlert(orgId: string, alertId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/alerts/${alertId}/acknowledge`, { method: 'POST' });
  revalidatePath('/alerts');
}

export async function resolveAlert(orgId: string, alertId: string): Promise<void> {
  await api(`/api/organizations/${orgId}/alerts/${alertId}/resolve`, { method: 'POST' });
  revalidatePath('/alerts');
}
