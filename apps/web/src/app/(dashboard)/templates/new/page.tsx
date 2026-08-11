import { NewTemplateForm } from './form';
import { createTemplateAction } from '../actions';
import { ErrorState, PageHeader } from '@/components/page';
import { getOrgContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NewTemplatePage() {
  const ctx = await getOrgContext();
  if (!ctx?.orgId) return <ErrorState message="Nenhuma organização selecionada." />;

  return (
    <div>
      <PageHeader title="Novo template" description="Crie um template mestre para replicar em várias contas." />
      <NewTemplateForm action={createTemplateAction.bind(null, ctx.orgId)} />
    </div>
  );
}
