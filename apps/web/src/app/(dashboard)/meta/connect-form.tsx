'use client';

import { useFormState } from 'react-dom';
import { FormError, SubmitButton } from '@/components/form';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

export function ConnectForm({ action }: { action: Action }) {
  const [error, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="rounded-xl border border-wise-border bg-wise-surface p-5">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Conectar conta (System User)</h2>
        <p className="text-xs text-wise-muted">
          Fluxo administrativo. Em produção, use o botão &quot;Conectar WhatsApp&quot; (Embedded
          Signup oficial da Meta) — o callback server-side já está implementado.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wabaId">WABA ID</Label>
          <Input id="wabaId" name="wabaId" placeholder="1234567890" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accessToken">Access token</Label>
          <Input id="accessToken" name="accessToken" type="password" placeholder="EAAG…" required />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SubmitButton pendingLabel="Conectando…">Conectar</SubmitButton>
        <FormError message={error} />
      </div>
    </form>
  );
}
