'use client';

import {
  BarChart3,
  Bell,
  Building2,
  Inbox,
  LayoutDashboard,
  MessageSquareText,
  ScrollText,
  Send,
  Settings,
  Users,
  Webhook,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/organizations', label: 'Empresas', icon: Building2 },
  { href: '/meta/accounts', label: 'Meta', icon: Webhook },
  { href: '/templates', label: 'Templates', icon: MessageSquareText },
  { href: '/campaigns', label: 'Campanhas', icon: Send },
  { href: '/contacts', label: 'Contatos', icon: Users },
  { href: '/reports', label: 'Relatórios', icon: BarChart3 },
  { href: '/alerts', label: 'Alertas', icon: Bell },
  { href: '/dead-letters', label: 'Dead-letter', icon: Inbox },
  { href: '/audit', label: 'Auditoria', icon: ScrollText },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-wise-border bg-wise-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-wise-yellow font-bold text-black">
          W
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Wise API Manager</div>
          <div className="text-xs text-wise-muted">Central de Mensageria</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-wise-yellow/10 text-wise-yellow'
                  : 'text-wise-muted hover:bg-wise-bg hover:text-wise-text',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
