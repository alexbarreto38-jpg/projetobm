import { en } from './locales/en';
import { ptBR, type Dictionary } from './locales/pt-BR';

/** Idiomas suportados. Adicionar um idioma = criar o dicionário e registrar aqui. */
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const LOCALE_COOKIE = 'wise_locale';

export const DICTIONARIES: Record<Locale, Dictionary> = {
  'pt-BR': ptBR,
  en,
};

/** Nome amigável de cada idioma (para o seletor). */
export const LOCALE_LABELS: Record<Locale, string> = {
  'pt-BR': 'Português (BR)',
  en: 'English',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export type { Dictionary };
