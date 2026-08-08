'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { FormError, Select, SubmitButton } from '@/components/form';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

type Action = (prev: string | null, formData: FormData) => Promise<string | null>;

const textarea =
  'w-full rounded-lg border border-wise-border bg-wise-bg p-3 text-sm text-wise-text placeholder:text-wise-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow';

export function NewTemplateForm({ action }: { action: Action }) {
  const [error, formAction] = useFormState(action, null);
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('Olá {{1}}, sua fatura vence em {{2}}.');
  const [footer, setFooter] = useState('');
  const [quickReplies, setQuickReplies] = useState('');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="space-y-4 rounded-xl border border-wise-border bg-wise-surface p-6">
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
          <Label htmlFor="header">Cabeçalho (opcional)</Label>
          <Input id="header" name="header" value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Aviso de cobrança" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Corpo (BODY)</Label>
          <textarea id="body" name="body" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={textarea} />
          <p className="text-xs text-wise-muted">Use {'{{1}}'}, {'{{2}}'} para variáveis.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="footer">Rodapé (opcional)</Label>
          <Input id="footer" name="footer" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Responda SAIR para cancelar" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quickReplies">Botões de resposta rápida (opcional)</Label>
          <Input id="quickReplies" name="quickReplies" value={quickReplies} onChange={(e) => setQuickReplies(e.target.value)} placeholder="Pagar agora, Falar com atendente" />
          <p className="text-xs text-wise-muted">Separe por vírgula.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="urlButtonText">Botão de link — texto (opcional)</Label>
            <Input id="urlButtonText" name="urlButtonText" placeholder="Ver fatura" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="urlButtonUrl">Botão de link — URL</Label>
            <Input id="urlButtonUrl" name="urlButtonUrl" placeholder="https://..." />
          </div>
        </div>

        <FormError message={error} />
        <SubmitButton>Criar template</SubmitButton>
      </form>

      {/* Prévia ao vivo estilo WhatsApp */}
      <div>
        <p className="mb-2 text-sm font-medium text-wise-muted">Prévia</p>
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="rounded-lg bg-[#075E54]/10 p-3">
              {header ? <div className="mb-1 text-sm font-semibold">{header}</div> : null}
              <div className="whitespace-pre-wrap text-sm">{body || '—'}</div>
              {footer ? <div className="mt-1 text-xs text-wise-muted">{footer}</div> : null}
            </div>
            {quickReplies
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((b) => (
                <div key={b} className="rounded-lg border border-wise-border py-1.5 text-center text-sm text-wise-yellow">
                  {b}
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
