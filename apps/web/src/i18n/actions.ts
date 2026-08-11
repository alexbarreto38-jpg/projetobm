'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './config';

/** Persiste o idioma escolhido no cookie. O layout é dinâmico, então o próximo
 * render (router.refresh no cliente) já usa o novo dicionário. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
