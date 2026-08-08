import { createHash } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';

/**
 * CampaignRouter + processamento (spec §23, §25, §53, §54).
 *
 * Resolve o público elegível (exclui opt-out e, para MARKETING, exige opt-in),
 * distribui os destinatários entre os números AUTORIZADOS e não pausados das
 * contas selecionadas (round-robin) e registra, para cada destinatário, qual
 * ativo enviará a mensagem. Gera Message (QUEUED) idempotente e enfileira o
 * envio. Nunca redireciona para contornar restrições (spec §25).
 */
export interface MessageSendEnqueuerLike {
  enqueue(messageId: string): Promise<void>;
}

const BATCH = 500;

export interface CampaignSummary {
  routes: number;
  recipients: number;
  messages: number;
  skipped: boolean;
  status: string;
}

export async function processCampaign(
  prisma: PrismaClient,
  campaignId: string,
  enqueuer?: MessageSendEnqueuerLike,
): Promise<CampaignSummary> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { targets: true, template: true },
  });
  if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada.`);
  // Cancelamento pedido antes do processamento: finaliza direto (spec §55).
  if (campaign.status === 'CANCEL_REQUESTED') {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'CANCELLED' } });
    return { routes: 0, recipients: 0, messages: 0, skipped: false, status: 'CANCELLED' };
  }
  if (campaign.status !== 'RUNNING') {
    return { routes: 0, recipients: 0, messages: 0, skipped: true, status: campaign.status };
  }

  const organizationId = campaign.organizationId;
  const requireConsent = campaign.template.category === 'MARKETING';

  // 1) Resolve rotas (conta, número, deployment APPROVED) — apenas ativos válidos.
  const routes = await resolveRoutes(prisma, campaign.templateId, campaign.targets);
  if (routes.length === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED' },
    });
    logger.warn({ campaignId }, 'Campanha sem rotas válidas (número/template aprovado)');
    return { routes: 0, recipients: 0, messages: 0, skipped: false, status: 'FAILED' };
  }

  // 2) Percorre o público elegível em lotes e gera destinatários/mensagens.
  let recipients = 0;
  let messages = 0;
  let cursor: string | undefined;
  let rr = 0;

  for (;;) {
    // Verifica cancelamento a cada lote (spec §55).
    const fresh = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (fresh?.status === 'CANCEL_REQUESTED') {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'CANCELLED' } });
      return { routes: routes.length, recipients, messages, skipped: false, status: 'CANCELLED' };
    }
    if (fresh?.status !== 'RUNNING') {
      return { routes: routes.length, recipients, messages, skipped: false, status: fresh?.status ?? '' };
    }

    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        optouts: { none: {} }, // exclui opt-out (spec §22)
        ...(requireConsent
          ? { consents: { some: { consentType: 'MARKETING', status: 'GRANTED' } } }
          : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (contacts.length === 0) break;

    for (const contact of contacts) {
      const route = routes[rr % routes.length]!;
      rr += 1;

      const dedupeKey = createHash('sha256')
        .update(`${campaignId}:${contact.id}:${campaign.templateId}`)
        .digest('hex');

      // Idempotência (spec §19, §54): destinatário único por (campanha, dedupe).
      const recipient = await prisma.campaignRecipient.upsert({
        where: { campaignId_dedupeKey: { campaignId, dedupeKey } },
        create: {
          organizationId,
          campaignId,
          contactId: contact.id,
          phoneNumberId: route.phoneNumberId,
          templateDeploymentId: route.deploymentId,
          dedupeKey,
        },
        update: {},
      });
      recipients += 1;

      const idempotencyKey = `msg_${campaignId}_${contact.id}`;
      const existingMsg = await prisma.message.findUnique({ where: { idempotencyKey } });
      if (!existingMsg) {
        const message = await prisma.message.create({
          data: {
            organizationId,
            campaignId,
            campaignRecipientId: recipient.id,
            contactId: contact.id,
            phoneNumberId: route.phoneNumberId,
            status: 'QUEUED',
            idempotencyKey,
          },
        });
        messages += 1;
        if (enqueuer) await enqueuer.enqueue(message.id);
      }
    }

    cursor = contacts[contacts.length - 1]!.id;
    if (contacts.length < BATCH) break;
  }

  logger.info({ campaignId, routes: routes.length, recipients, messages }, 'Campanha processada');
  return { routes: routes.length, recipients, messages, skipped: false, status: 'RUNNING' };
}

interface Route {
  accountId: string;
  phoneNumberId: string;
  deploymentId: string;
}

async function resolveRoutes(
  prisma: PrismaClient,
  templateId: string,
  targets: { whatsappAccountId: string; phoneNumberId: string | null }[],
): Promise<Route[]> {
  const accountIds = [...new Set(targets.map((t) => t.whatsappAccountId))];

  // Deployments APPROVED por conta.
  const deployments = await prisma.templateDeployment.findMany({
    where: { templateId, targetAccountId: { in: accountIds }, status: 'APPROVED' },
    select: { id: true, targetAccountId: true },
  });
  const deploymentByAccount = new Map(deployments.map((d) => [d.targetAccountId, d.id]));

  const routes: Route[] = [];
  for (const accountId of accountIds) {
    const deploymentId = deploymentByAccount.get(accountId);
    if (!deploymentId) continue; // conta sem template aprovado é ignorada

    // Números específicos do target, ou todos os não pausados da conta.
    const specific = targets
      .filter((t) => t.whatsappAccountId === accountId && t.phoneNumberId)
      .map((t) => t.phoneNumberId!);

    const numbers = await prisma.phoneNumber.findMany({
      where: {
        whatsappAccountId: accountId,
        isPaused: false, // nunca usa número restrito (spec §25)
        ...(specific.length > 0 ? { id: { in: specific } } : {}),
      },
      select: { id: true },
    });
    for (const n of numbers) {
      routes.push({ accountId, phoneNumberId: n.id, deploymentId });
    }
  }
  return routes;
}
