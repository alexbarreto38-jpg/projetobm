import type { PrismaClient } from '@wise/database';
import { mapDeploymentStatus, mapMessageStatus } from '@wise/types';
import { logger } from '@wise/logger';

/**
 * Processador de eventos de webhook (spec §30, §31). Atualiza mensagens e
 * implantações de template a partir do payload BRUTO já persistido. O payload
 * original nunca é sobrescrito; criamos MessageEvent preservando o raw.
 *
 * Idempotente por evento: se o WebhookEvent já está PROCESSED, não reprocessa.
 */
export interface ProcessSummary {
  statusesProcessed: number;
  templatesProcessed: number;
  qualityProcessed: number;
  skipped: boolean;
}

export async function processWebhookEvent(
  prisma: PrismaClient,
  webhookEventId: string,
): Promise<ProcessSummary> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event) throw new Error(`WebhookEvent ${webhookEventId} não encontrado.`);
  if (event.status === 'PROCESSED') {
    return { statusesProcessed: 0, templatesProcessed: 0, qualityProcessed: 0, skipped: true };
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: 'PROCESSING' },
  });

  let statusesProcessed = 0;
  let templatesProcessed = 0;
  let qualityProcessed = 0;

  try {
    const payload = event.rawPayload as WhatsAppWebhookPayload;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};

        // Atualizações de status de mensagem (sent/delivered/read/failed).
        for (const st of value.statuses ?? []) {
          if (await applyMessageStatus(prisma, st)) statusesProcessed += 1;
        }

        // Atualizações de status de template.
        if (change.field === 'message_template_status_update') {
          templatesProcessed += await applyTemplateStatus(prisma, value);
        }

        // Queda de qualidade do número → PAUSA operacional (spec §25). Nunca
        // redirecionamos nem tentamos contornar a restrição da Meta.
        if (change.field === 'phone_number_quality_update') {
          if (await applyPhoneQuality(prisma, entry.id, value)) qualityProcessed += 1;
        }
      }
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    return { statusesProcessed, templatesProcessed, qualityProcessed, skipped: false };
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

async function applyMessageStatus(
  prisma: PrismaClient,
  st: RawStatus,
): Promise<boolean> {
  if (!st.id) return false;
  const message = await prisma.message.findFirst({ where: { externalMessageId: st.id } });
  if (!message) {
    // Sem mensagem correspondente: o raw já está preservado em webhook_events.
    logger.warn({ externalMessageId: st.id }, 'Status sem mensagem correspondente');
    return false;
  }

  const internal = mapMessageStatus(st.status ?? '');
  const timestamp = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
  const error = st.errors?.[0];

  await prisma.messageEvent.create({
    data: {
      organizationId: message.organizationId,
      messageId: message.id,
      externalMessageId: st.id,
      status: st.status ?? 'unknown',
      timestamp,
      rawPayload: st as object,
    },
  });

  if (internal) {
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: internal,
        errorCode: error?.code != null ? String(error.code) : message.errorCode,
        errorMessage: error?.title ?? error?.message ?? message.errorMessage,
      },
    });
  }
  return true;
}

async function applyTemplateStatus(
  prisma: PrismaClient,
  value: RawChangeValue,
): Promise<number> {
  const externalId = value.message_template_id;
  const eventName = value.event;
  if (!externalId || !eventName) return 0;

  const internal = mapDeploymentStatus(eventName);
  if (!internal) return 0;

  const result = await prisma.templateDeployment.updateMany({
    where: { externalTemplateId: String(externalId) },
    data: { status: internal, errorMessage: value.reason ?? null },
  });
  return result.count;
}

const onlyDigits = (s: string): string => s.replace(/\D/g, '');

/**
 * Reage a `phone_number_quality_update` (spec §25). Quando a Meta sinaliza que
 * o número foi restringido (event FLAGGED), PAUSAMOS o número e abrimos um
 * alerta CRÍTICO — a plataforma não redireciona envios nem tenta contornar a
 * restrição. Recuperação (UNFLAGGED) NÃO reativa automaticamente: quem decide
 * religar é o operador. Campos confirmados na doc oficial da Meta (spec §66).
 */
async function applyPhoneQuality(
  prisma: PrismaClient,
  wabaId: string | undefined,
  value: RawChangeValue,
): Promise<boolean> {
  const display = value.display_phone_number;
  const eventName = value.event;
  if (!display || !eventName) return false;

  // Escopo pela WABA (entry.id) e casa por dígitos, robusto à formatação.
  const account = wabaId
    ? await prisma.whatsAppAccount.findFirst({
        where: { externalAccountId: wabaId },
        select: { id: true },
      })
    : null;
  const candidates = await prisma.phoneNumber.findMany({
    where: {
      displayPhoneNumber: { not: null },
      ...(account ? { whatsappAccountId: account.id } : {}),
    },
    select: { id: true, organizationId: true, displayPhoneNumber: true, isPaused: true },
  });
  const target = onlyDigits(display);
  const phone = candidates.find((p) => onlyDigits(p.displayPhoneNumber ?? '') === target);
  if (!phone) {
    logger.warn({ display, eventName }, 'Quality update sem número correspondente');
    return false;
  }

  const restricting = eventName.toUpperCase() === 'FLAGGED';
  await prisma.phoneNumber.update({
    where: { id: phone.id },
    data: {
      ...(value.current_limit ? { messagingLimitInfo: { current_limit: value.current_limit } } : {}),
      ...(restricting ? { isPaused: true } : {}),
    },
  });

  // Alerta apenas na transição para pausado (evita ruído em reentregas).
  if (restricting && !phone.isPaused) {
    await prisma.systemAlert.create({
      data: {
        organizationId: phone.organizationId,
        severity: 'CRITICAL',
        code: 'PHONE_QUALITY_FLAGGED',
        title: 'Número pausado por queda de qualidade (Meta).',
        detail: `A Meta sinalizou "${eventName}" para ${display}. Envios pausados até revisão.`,
        metadata: { phoneNumberId: phone.id, event: eventName, current_limit: value.current_limit },
      },
    });
    logger.warn({ phoneNumberId: phone.id, eventName }, 'Número pausado por qualidade (spec §25)');
  }
  return true;
}

// --- tipos do payload (parciais; confirmar campos na doc oficial) ---------
interface WhatsAppWebhookPayload {
  entry?: Array<{ id?: string; changes?: RawChange[] }>;
}
interface RawChange {
  field?: string;
  value?: RawChangeValue;
}
interface RawChangeValue {
  statuses?: RawStatus[];
  message_template_id?: string | number;
  message_template_name?: string;
  event?: string;
  reason?: string;
  // phone_number_quality_update
  display_phone_number?: string;
  current_limit?: string;
}
interface RawStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number | string; title?: string; message?: string }>;
}
