'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { loginAction, signupAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useI18n } from '@/i18n/provider';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const { dict } = useI18n();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? dict.common.loading : label}
    </Button>
  );
}

export default function LoginPage() {
  const { dict } = useI18n();
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
            <div className="text-lg font-semibold">{dict.app.name}</div>
            <div className="text-xs text-wise-muted">{dict.app.tagline}</div>
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-xl border border-wise-border bg-wise-surface p-6">
          {mode === 'signup' ? (
            <div className="space-y-1.5">
              <Label htmlFor="organizationName">{dict.auth.company}</Label>
              <Input
                id="organizationName"
                name="organizationName"
                placeholder={dict.auth.companyPlaceholder}
                required
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">{dict.auth.email}</Label>
            <Input id="email" name="email" type="email" placeholder="voce@empresa.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{dict.auth.password}</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <SubmitButton label={mode === 'login' ? dict.auth.signIn : dict.auth.createAccount} />

          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full text-center text-xs text-wise-muted hover:text-wise-text"
          >
            {mode === 'login' ? dict.auth.toSignup : dict.auth.toLogin}
          </button>
        </form>
      </div>
    </main>
  );
}
