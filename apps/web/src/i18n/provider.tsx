'use client';

import { createContext, useContext } from 'react';
import type { Dictionary, Locale } from './config';

interface I18nValue {
  dict: Dictionary;
  locale: Locale;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Disponibiliza o dicionário resolvido no servidor para a árvore client. */
export function I18nProvider({
  dict,
  locale,
  children,
}: I18nValue & { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ dict, locale }}>{children}</I18nContext.Provider>;
}

/** Hook para Client Components: retorna o dicionário e o idioma ativos. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n precisa estar dentro de <I18nProvider>.');
  return ctx;
}
