import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getMe } from '@/lib/session';
import { getDictionary, getLocale } from '@/i18n/server';
import { I18nProvider } from '@/i18n/provider';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');

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
