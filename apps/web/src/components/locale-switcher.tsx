'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_LABELS, LOCALES } from '@/i18n/config';
import { setLocaleAction } from '@/i18n/actions';
import { useI18n } from '@/i18n/provider';

/** Seletor de idioma: grava o cookie e recarrega os Server Components. */
export function LocaleSwitcher() {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-sm text-wise-muted">
      <span className="sr-only">{dict.topbar.language}</span>
      <select
        aria-label={dict.topbar.language}
        defaultValue={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        className="rounded-lg border border-wise-border bg-wise-bg px-2 py-1 text-xs text-wise-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow disabled:opacity-50"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
