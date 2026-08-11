import { logoutAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import type { Dictionary } from '@/i18n/config';

export function Topbar({ email, dict }: { email: string; dict: Dictionary }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-wise-border px-6">
      <div className="text-sm text-wise-muted">
        {dict.topbar.context} <span className="text-wise-border">/</span>{' '}
        <span className="text-wise-text">{dict.topbar.breadcrumb}</span>
      </div>
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <span className="text-sm text-wise-muted">{email}</span>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" type="submit">
            {dict.topbar.logout}
          </Button>
        </form>
      </div>
    </header>
  );
}
