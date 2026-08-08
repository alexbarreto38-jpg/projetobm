import { EmptyState, PageHeader } from '@/components/page';

export const dynamic = 'force-dynamic';

export default function AlertsPage() {
  return (
    <div>
      <PageHeader
        title="Alertas"
        description="Conexões que requerem atenção, templates rejeitados, números restritos e saúde de webhooks."
      />
      <EmptyState
        title="Sem alertas no momento"
        description="Alertas do sistema (ex.: número pausado por restrição da plataforma) aparecerão aqui."
      />
    </div>
  );
}
