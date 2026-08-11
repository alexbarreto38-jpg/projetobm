'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { FormError, SubmitButton } from '@/components/form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/page';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

interface Template {
  id: string;
  name: string;
  language: string;
}
interface Account {
  id: string;
  name?: string;
  externalAccountId: string;
}

const STEPS = ['Template', 'Contas', 'Revisão'];

export function NewCampaignForm({
  action,
  templates,
  accounts,
}: {
  action: Action;
  templates: Template[];
  accounts: Account[];
}) {
  const [error, formAction] = useFormState(action, null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);

  if (templates.length === 0 || accounts.length === 0) {
    return (
      <EmptyState
        title="Pré-requisitos faltando"
        description="É preciso ao menos um template e uma conta conectada para criar uma campanha."
      />
    );
  }

  const template = templates.find((t) => t.id === templateId);
  const canNext =
    (step === 0 && name.trim().length >= 2 && templateId) || (step === 1 && selected.length > 0);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {/* Indicador de passos */}
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                i <= step ? 'bg-wise-yellow text-black' : 'bg-wise-border text-wise-muted'
              }`}
            >
              {i + 1}
            </span>
            <span className={i === step ? 'text-wise-text' : 'text-wise-muted'}>{label}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 text-wise-border">→</span> : null}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-wise-border bg-wise-surface p-6">
        {/* Passo 1: nome + template. Ficam SEMPRE montados (apenas ocultos por
            CSS fora do passo 1) para irem no submit — se forem desmontados, o
            formData não os envia e a validação do backend falha. */}
        <div className={step === 0 ? 'space-y-4' : 'hidden'}>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome da campanha</Label>
            <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cobrança — Maio" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="templateId">Template</Label>
            <select
              id="templateId"
              name="templateId"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 w-full rounded-lg border border-wise-border bg-wise-bg px-3 text-sm text-wise-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Passo 2: contas (checkboxes ficam sempre montados para irem no submit) */}
        <div className={step === 1 ? 'space-y-2' : 'hidden'}>
          <Label>Contas de envio</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="accountIds"
                  value={a.id}
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  className="accent-wise-yellow"
                />
                {a.name ?? a.externalAccountId}
              </label>
            ))}
          </div>
        </div>

        {/* Passo 3: revisão */}
        {step === 2 ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium">Revisão</h3>
            <Row label="Nome" value={name} />
            <Row label="Template" value={template ? `${template.name} (${template.language})` : '—'} />
            <Row label="Contas" value={`${selected.length} selecionada(s)`} />
            <p className="text-xs text-wise-muted">
              O preflight de compliance roda ao abrir a campanha; o envio só inicia se não estiver
              BLOQUEADO.
            </p>
          </div>
        ) : null}
      </div>

      <FormError message={error} />

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Voltar
        </Button>
        {step < 2 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continuar
          </Button>
        ) : (
          <SubmitButton>Criar campanha</SubmitButton>
        )}
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-wise-border/50 pb-2">
      <span className="text-wise-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
