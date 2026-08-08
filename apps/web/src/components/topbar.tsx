import { logoutAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';

export function Topbar({ email }: { email: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-wise-border px-6">
      <div className="text-sm text-wise-muted">
        Central de Mensageria <span className="text-wise-border">/</span>{' '}
        <span className="text-wise-text">Painel</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-wise-muted">{email}</span>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" type="submit">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
