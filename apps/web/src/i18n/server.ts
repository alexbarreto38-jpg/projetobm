import 'server-only';
import { cookies } from 'next/headers';
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  isLocale,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
} from './config';

/** Idioma ativo, lido do cookie `wise_locale` (fallback: pt-BR). Server-side. */
export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Dicionário do idioma ativo. Use em Server Components/páginas. */
export function getDictionary(): Dictionary {
  return DICTIONARIES[getLocale()];
}
