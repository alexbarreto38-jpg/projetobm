'use client';

import { useFormState } from 'react-dom';
import { FormError, Select, SubmitButton } from '@/components/form';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

export function NewTemplateForm({ action }: { action: Action }) {
  const [error, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="max-w-xl space-y-4 rounded-xl border border-wise-border bg-wise-surface p-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" placeholder="cobranca_v1" required />
        <p className="text-xs text-wise-muted">Apenas minúsculas, números e underscore.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="language">Idioma</Label>
          <Input id="language" name="language" defaultValue="pt_BR" required />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select
            name="category"
            defaultValue="UTILITY"
            options={[
              { value: 'UTILITY', label: 'Utility' },
              { value: 'MARKETING', label: 'Marketing' },
              { value: 'AUTHENTICATION', label: 'Authentication' },
            ]}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Corpo (BODY)</Label>
        <textarea
          id="body"
          name="body"
          required
          rows={4}
          placeholder="Olá {{1}}, sua fatura vence em {{2}}."
          className="w-full rounded-lg border border-wise-border bg-wise-bg p-3 text-sm text-wise-text placeholder:text-wise-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
        />
        <p className="text-xs text-wise-muted">Use {'{{1}}'}, {'{{2}}'} para variáveis.</p>
      </div>
      <FormError message={error} />
      <SubmitButton>Criar template</SubmitButton>
    </form>
  );
}
