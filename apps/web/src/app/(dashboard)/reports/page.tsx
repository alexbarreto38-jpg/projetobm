import { EmptyState, PageHeader } from '@/components/page';

export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Enviadas, entregues, lidas e falhas — com taxas por conta, número e campanha."
      />
      <EmptyState
        title="Relatórios em construção (Fase 9)"
        description="Os eventos de mensagem já são capturados via webhook; o dashboard de métricas será habilitado na próxima fase."
      />
    </div>
  );
}
