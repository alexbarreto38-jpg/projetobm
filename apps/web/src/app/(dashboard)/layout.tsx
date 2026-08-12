import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { api } from '@/lib/api';
import type { Me } from '@/lib/session';
import { getDictionary, getLocale } from '@/i18n/server';
import { I18nProvider } from '@/i18n/provider';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const res = await api<{ user: Me }>('/api/auth/me');

  // Sessão ausente/expirada/inválida → login. (Chega aqui só com cookie
  // presente, pois o middleware já barra quem não tem cookie.)
  if (res.status === 401 || res.status === 403) redirect('/login');

  // API indisponível (ex.: instância grátis "acordando", ou erro transitório):
  // NÃO redirecionamos — isso causaria loop com o /login. Mostramos um aviso que
  // recarrega sozinho até a API responder.
  if (!res.ok || !res.data?.user) {
    return <WakingNotice />;
  }

  const me = res.data.user;
  const dict = getDictionary();
  const locale = getLocale();

  return (
    <I18nProvider dict={dict} locale={locale}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={me.email} dict={dict} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </I18nProvider>
  );
}

/**
 * Aviso de "sistema acordando". No plano grátis a API hiberna após inatividade e
 * leva alguns segundos para responder ao primeiro acesso. Em vez de redirecionar
 * (o que causava loop), mostramos um aviso com botão para tentar de novo.
 */
function WakingNotice() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-4xl">☕</div>
      <h1 className="text-lg font-semibold text-wise-text">Acordando o sistema…</h1>
      <p className="max-w-sm text-sm text-wise-muted">
        No plano gratuito o servidor hiberna quando fica parado por um tempo.
        Estamos religando — aguarde alguns segundos e recarregue.
      </p>
      <a
        href="/dashboard"
        className="mt-2 rounded-lg bg-wise-yellow px-4 py-2 text-sm font-medium text-black"
      >
        Recarregar
      </a>
    </div>
  );
}
