import { getDictionary, getLocale } from '@/i18n/server';
import { I18nProvider } from '@/i18n/provider';

export const dynamic = 'force-dynamic';

/** Provê o dicionário para as telas de autenticação (login/cadastro). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider dict={getDictionary()} locale={getLocale()}>
      {children}
    </I18nProvider>
  );
}
