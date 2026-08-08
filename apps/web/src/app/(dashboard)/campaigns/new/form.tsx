'use client';

import { useFormState } from 'react-dom';
import { FormError, SubmitButton } from '@/components/form';
import { EmptyState } from '@/components/page';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

export function NewCampaignForm({
  action,
  templates,
  accounts,
}: {
  action: Action;
  templates: { id: string; name: string; language: string }[];
  accounts: { id: string; name?: string; externalAccountId: string }[];
}) {
  const [error, formAction] = useFormState(action, null);

  if (templates.length === 0 || accounts.length === 0) {
    return (
      <EmptyState
        title="Pré-requisitos faltando"
        description="É preciso ao menos um template e uma conta conectada para criar uma campanha."
      />
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-5 rounded-xl border border-wise-border bg-wise-surface p-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome da campanha</Label>
        <Input id="name" name="name" placeholder="Cobrança — Maio" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="templateId">Template</Label>
        <select
          id="templateId"
          name="templateId"
          required
          className="h-10 w-full rounded-lg border border-wise-border bg-wise-bg px-3 text-sm text-wise-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Contas de envio</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="accountIds" value={a.id} className="accent-wise-yellow" />
              {a.name ?? a.externalAccountId}
            </label>
          ))}
        </div>
      </div>

      <FormError message={error} />
      <SubmitButton>Criar campanha</SubmitButton>
    </form>
  );
}
