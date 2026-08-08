'use client';

import { useFormState } from 'react-dom';
import { FormError, SubmitButton } from '@/components/form';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

export function ContactForms({
  createAction,
  importAction,
}: {
  createAction: Action;
  importAction: Action;
}) {
  const [createErr, createFormAction] = useFormState(createAction, null);
  const [importErr, importFormAction] = useFormState(importAction, null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={createFormAction} className="space-y-3 rounded-xl border border-wise-border bg-wise-surface p-5">
        <h2 className="text-sm font-medium">Novo contato</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" placeholder="(11) 99000-0001" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Opcional" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton size="sm">Adicionar</SubmitButton>
          <FormError message={createErr} />
        </div>
      </form>

      <form action={importFormAction} className="space-y-3 rounded-xl border border-wise-border bg-wise-surface p-5">
        <h2 className="text-sm font-medium">Importar CSV</h2>
        <textarea
          name="csv"
          rows={4}
          placeholder={'phone,name\n11990000001,Ana\n11990000002,Bruno'}
          className="w-full rounded-lg border border-wise-border bg-wise-bg p-3 font-mono text-xs text-wise-text placeholder:text-wise-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
        />
        <div className="flex items-center gap-3">
          <SubmitButton size="sm" pendingLabel="Enfileirando…">
            Importar
          </SubmitButton>
          <FormError message={importErr} />
        </div>
        <p className="text-xs text-wise-muted">Processado em background por streaming.</p>
      </form>
    </div>
  );
}
