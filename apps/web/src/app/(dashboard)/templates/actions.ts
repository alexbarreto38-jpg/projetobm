'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

interface Component {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string }[];
}

export async function createTemplateAction(
  orgId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const header = String(formData.get('header') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const footer = String(formData.get('footer') ?? '').trim();
  const quickReplies = String(formData.get('quickReplies') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const urlButtonText = String(formData.get('urlButtonText') ?? '').trim();
  const urlButtonUrl = String(formData.get('urlButtonUrl') ?? '').trim();

  // Monta os componentes na ordem esperada pela Meta.
  const components: Component[] = [];
  if (header) components.push({ type: 'HEADER', format: 'TEXT', text: header });
  components.push({ type: 'BODY', text: body });
  if (footer) components.push({ type: 'FOOTER', text: footer });

  const buttons = [
    ...quickReplies.slice(0, 10).map((text) => ({ type: 'QUICK_REPLY', text })),
    ...(urlButtonText && urlButtonUrl
      ? [{ type: 'URL', text: urlButtonText, url: urlButtonUrl }]
      : []),
  ];
  if (buttons.length > 0) components.push({ type: 'BUTTONS', buttons });

  const payload = {
    name: String(formData.get('name') ?? ''),
    language: String(formData.get('language') ?? 'pt_BR'),
    category: String(formData.get('category') ?? 'UTILITY'),
    components,
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
