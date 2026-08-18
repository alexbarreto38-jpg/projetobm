import { ErrorState, PageHeader } from '@/components/page';
import { getOrgContext } from '@/lib/session';
import { AssistantChat } from './chat';

export const dynamic = 'force-dynamic';

/**
 * Painel de conversa com o assistente (spec §1, §2). Mesma sessão/rascunho do
 * canal WhatsApp — o estado da operação vive no backend.
 */
export default async function AssistantPage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  return (
    <div>
      <PageHeader
        title="Assistente"
        description="Converse em linguagem natural para preparar, revisar e disparar campanhas. Nenhum envio acontece sem sua confirmação explícita."
      />
      <AssistantChat orgId={ctx.orgId} />
    </div>
  );
}
