import { Badge, statusTone } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/page';
import { api } from '@/lib/api';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PhoneNumber {
  id: string;
  displayPhoneNumber?: string;
  qualityStatus?: string;
  isPaused: boolean;
}
interface Account {
  id: string;
  name?: string;
  externalAccountId: string;
  accountModel: string;
  metaConnection?: { status: string; lastSyncAt?: string };
  phoneNumbers?: PhoneNumber[];
}

export default async function MetaAccountsPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  const res = await api<{ accounts: Account[] }>(`/api/organizations/${ctx.orgId}/meta/accounts`);
  if (!res.ok) return <ErrorState message={`Não foi possível carregar as contas: ${res.error}`} />;
  const accounts = res.data?.accounts ?? [];

  return (
    <div>
      <PageHeader
        title="Contas Meta"
        description="Contas WhatsApp conectadas via Embedded Signup, seus números e status."
      />
      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta conectada"
          description="Conecte uma conta oficialmente pelo fluxo Embedded Signup da Meta."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Conta</Th>
              <Th>Modelo</Th>
              <Th>Números</Th>
              <Th>Conexão</Th>
              <Th>Última sync</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-medium">{a.name ?? a.externalAccountId}</div>
                  <div className="text-xs text-wise-muted">{a.externalAccountId}</div>
                </Td>
                <Td>
                  <Badge>{a.accountModel}</Badge>
                </Td>
                <Td>
                  {(a.phoneNumbers ?? []).length}{' '}
                  <span className="text-wise-muted">
                    ({(a.phoneNumbers ?? []).filter((n) => !n.isPaused).length} ativos)
                  </span>
                </Td>
                <Td>
                  <Badge tone={statusTone(a.metaConnection?.status ?? '')}>
                    {a.metaConnection?.status ?? '—'}
                  </Badge>
                </Td>
                <Td>
                  {a.metaConnection?.lastSyncAt
                    ? new Date(a.metaConnection.lastSyncAt).toLocaleString('pt-BR')
                    : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
