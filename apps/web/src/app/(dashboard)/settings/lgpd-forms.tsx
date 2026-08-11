'use client';

import { useFormState } from 'react-dom';
import { FormError, SubmitButton } from '@/components/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

export function LgpdForms({
  purgeAction,
  deleteAction,
  slug,
}: {
  purgeAction: Action;
  deleteAction: Action;
  slug: string;
}) {
  const [purgeMsg, purgeFormAction] = useFormState(purgeAction, null);
  const [deleteErr, deleteFormAction] = useFormState(deleteAction, null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Exportar dados (LGPD)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-wise-muted">Baixe os dados pessoais/operacionais da organização (sem segredos).</p>
          <a href="/api/export">
            <span className="inline-flex h-9 items-center rounded-lg bg-wise-yellow px-4 text-sm font-medium text-black hover:bg-wise-yellowDim">
              Baixar exportação (JSON)
            </span>
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retenção / minimização</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={purgeFormAction} className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="olderThanDays">Apagar dados operacionais mais antigos que (dias)</Label>
              <Input id="olderThanDays" name="olderThanDays" type="number" defaultValue={90} min={1} />
            </div>
            <SubmitButton size="sm" variant="outline">
              Purgar antigos
            </SubmitButton>
            {purgeMsg ? <p className="text-wise-muted">{purgeMsg}</p> : null}
          </form>
        </CardContent>
      </Card>

      <Card className="border-red-500/30 md:col-span-2">
        <CardHeader>
          <CardTitle>Excluir organização (irreversível)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={deleteFormAction} className="space-y-3 text-sm">
            <p className="text-wise-muted">
              Remove TODOS os dados desta organização. Digite o slug{' '}
              <code className="text-wise-text">{slug}</code> para confirmar.
            </p>
            <div className="flex gap-2">
              <Input name="confirmSlug" placeholder={slug} className="max-w-xs" />
              <SubmitButton size="sm" variant="danger" pendingLabel="Excluindo…">
                Excluir tudo
              </SubmitButton>
            </div>
            <FormError message={deleteErr} />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
