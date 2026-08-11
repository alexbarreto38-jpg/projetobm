'use client';

import { loadMoreAuditAction, type AuditLogItem } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, Td, Th } from '@/components/page';
import { useI18n } from '@/i18n/provider';
import { useLoadMore } from '@/lib/use-load-more';

/**
 * Lista de auditoria com "Carregar mais" (paginação por cursor no cliente).
 * Recebe a primeira página renderizada no servidor e vai acumulando as demais.
 */
export function AuditList({
  initialLogs,
  initialCursor,
}: {
  initialLogs: AuditLogItem[];
  initialCursor: string | null;
}) {
  const { dict, locale } = useI18n();
  const { items, hasMore, pending, loadMore } = useLoadMore(
    initialLogs,
    initialCursor,
    async (cursor) => {
      const page = await loadMoreAuditAction(cursor);
      return { items: page.logs, nextCursor: page.nextCursor };
    },
  );

  return (
    <div>
      <Table>
        <thead>
          <tr>
            <Th>{dict.audit.colAction}</Th>
            <Th>{dict.audit.colUser}</Th>
            <Th>{dict.audit.colEntity}</Th>
            <Th>{dict.audit.colDate}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <Td>
                <Badge>{l.action}</Badge>
              </Td>
              <Td>{l.user?.email ?? dict.common.empty}</Td>
              <Td>
                <span className="text-wise-muted">
                  {l.entityType ?? dict.common.empty}
                  {l.entityId ? ` · ${l.entityId.slice(0, 8)}…` : ''}
                </span>
              </Td>
              <Td>{new Date(l.createdAt).toLocaleString(locale)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? dict.common.loading : dict.common.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
