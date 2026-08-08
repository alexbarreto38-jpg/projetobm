'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { loginAction, signupAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Aguarde…' : label}
    </Button>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const action = mode === 'login' ? loginAction : signupAction;
  const [error, formAction] = useFormState(action, null);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-wise-yellow text-lg font-bold text-black">
            W
          </div>
          <div>
            <div className="text-lg font-semibold">Wise API Manager</div>
            <div className="text-xs text-wise-muted">Central de Mensageria</div>
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-xl border border-wise-border bg-wise-surface p-6">
          {mode === 'signup' ? (
            <div className="space-y-1.5">
              <Label htmlFor="organizationName">Empresa</Label>
              <Input id="organizationName" name="organizationName" placeholder="Minha Empresa" required />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" placeholder="voce@empresa.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <SubmitButton label={mode === 'login' ? 'Entrar' : 'Criar conta'} />

          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full text-center text-xs text-wise-muted hover:text-wise-text"
          >
            {mode === 'login' ? 'Criar uma nova conta' : 'Já tenho conta — entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
