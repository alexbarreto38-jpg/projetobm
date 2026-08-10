import { AuditList } from './audit-list';
import type { AuditLogItem } from './actions';
import { EmptyState, ErrorState, PageHeader } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';
import { getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const dict = getDictionary();
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ logs: AuditLogItem[]; nextCursor?: string | null }>(
    `/api/organizations/${ctx.orgId}/audit`,
  );
  if (!res.ok) return <ErrorState message={`${dict.audit.title}: ${res.error}`} />;
  const logs = res.data?.logs ?? [];

  return (
    <div>
      <PageHeader title={dict.audit.title} description={dict.audit.description} />
      {logs.length === 0 ? (
        <EmptyState title={dict.audit.emptyTitle} description={dict.audit.emptyDescription} />
      ) : (
        <AuditList initialLogs={logs} initialCursor={res.data?.nextCursor ?? null} />
      )}
    </div>
  );
}
