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
import { useI18n } from '@/i18n/provider';
import type { Dictionary } from '@/i18n/config';

const NAV = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/organizations', key: 'organizations', icon: Building2 },
  { href: '/meta/accounts', key: 'meta', icon: Webhook },
  { href: '/templates', key: 'templates', icon: MessageSquareText },
  { href: '/campaigns', key: 'campaigns', icon: Send },
  { href: '/contacts', key: 'contacts', icon: Users },
  { href: '/reports', key: 'reports', icon: BarChart3 },
  { href: '/alerts', key: 'alerts', icon: Bell },
  { href: '/dead-letters', key: 'deadLetters', icon: Inbox },
  { href: '/audit', key: 'audit', icon: ScrollText },
  { href: '/settings', key: 'settings', icon: Settings },
] satisfies { href: string; key: keyof Dictionary['nav']; icon: typeof Bell }[];

export function Sidebar() {
  const pathname = usePathname();
  const { dict } = useI18n();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-wise-border bg-wise-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-wise-yellow font-bold text-black">
          W
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">{dict.app.name}</div>
          <div className="text-xs text-wise-muted">{dict.app.tagline}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ href, key, icon: Icon }) => {
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
              {dict.nav[key]}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
