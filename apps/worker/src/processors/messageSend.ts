import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import { MetaApiError } from '@wise/meta-provider';
import type { AccountModel } from '@wise/types';
import type { WorkerMeta } from '../meta.js';

/**
 * Envio de uma mensagem (spec §25, §31, §48). Idempotente por mensagem.
 *
 * Salvaguardas de compliance ANTES de enviar: bloqueia contato em opt-out (§22)
 * e número pausado (§25). Se a Meta indicar restrição da conta/número, PAUSA o
 * número e alerta — nunca redireciona para escapar da restrição (§25).
 */
export interface MessageSendResult {
  status: string;
  skipped: boolean;
}

export async function processMessageSend(
  prisma: PrismaClient,
  meta: WorkerMeta,
  messageId: string,
): Promise<MessageSendResult> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      campaign: { select: { status: true } },
      contact: true,
      campaignRecipient: {
        include: {
          templateDeployment: { include: { template: true } },
          phoneNumber: { include: { whatsappAccount: { include: { metaConnection: true } } } },
        },
      },
    },
  });
  if (!message) throw new Error(`Mensagem ${messageId} não encontrada.`);

  // Idempotência (spec §19): já enviada ou não mais QUEUED → não reenvia.
  if (message.externalMessageId || message.status !== 'QUEUED') {
    return { status: message.status, skipped: true };
  }

  // Campanha cancelada: não gera novos envios (spec §55). Jobs já enviados à
  // Meta não podem ser "desenviados", mas este ainda não foi.
  if (message.campaign && ['CANCEL_REQUESTED', 'CANCELLED'].includes(message.campaign.status)) {
    await setFailed(prisma, messageId, 'Campanha cancelada antes do envio.');
    return { status: 'FAILED', skipped: false };
  }

  const recipient = message.campaignRecipient;
  const phone = recipient?.phoneNumber;
  const deployment = recipient?.templateDeployment;
  if (!recipient || !phone || !deployment || !message.contact) {
    await setFailed(prisma, messageId, 'Dados de envio incompletos.');
    return { status: 'FAILED', skipped: false };
  }

  // Salvaguarda: opt-out (spec §22).
  const optedOut = await prisma.contactOptout.findUnique({
    where: { organizationId_contactId: { organizationId: message.organizationId, contactId: message.contact.id } },
  });
  if (optedOut) {
    await setFailed(prisma, messageId, 'Contato em opt-out.');
    return { status: 'FAILED', skipped: false };
  }

  // Salvaguarda: número pausado por restrição (spec §25).
  if (phone.isPaused) {
    await setFailed(prisma, messageId, 'Número pausado por restrição da plataforma.');
    return { status: 'FAILED', skipped: false };
  }

  const credentialId = phone.whatsappAccount.metaConnection.credentialId;
  const credential = credentialId
    ? await prisma.credential.findUnique({ where: { id: credentialId } })
    : null;
  if (!credential || credential.status !== 'ACTIVE') {
    await setFailed(prisma, messageId, 'Credencial inválida ou revogada.');
    return { status: 'FAILED', skipped: false };
  }

  await prisma.message.update({ where: { id: messageId }, data: { status: 'PROCESSING' } });

  const accessToken = meta.vault.decrypt(credential.encryptedToken);
  const adapter = meta.provider.adapterFor(phone.whatsappAccount.accountModel as AccountModel);

  try {
    const result = await adapter.sendMessage(
      { externalAccountId: phone.whatsappAccount.externalAccountId, accessToken },
      {
        toPhone: message.contact.phone,
        templateName: deployment.template.name,
        templateLanguage: deployment.template.language,
        fromPhoneNumberId: phone.externalPhoneNumberId,
        idempotencyKey: message.idempotencyKey,
      },
    );
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'SENT', externalMessageId: result.externalMessageId ?? null },
    });
    return { status: 'SENT', skipped: false };
  } catch (err) {
    if (err instanceof MetaApiError) {
      // Restrição da conta/número: PAUSA o número e alerta (spec §25). Não redireciona.
      if (err.category === 'ACCOUNT_STATE') {
        await prisma.phoneNumber.update({ where: { id: phone.id }, data: { isPaused: true } });
        await prisma.systemAlert.create({
          data: {
            organizationId: message.organizationId,
            severity: 'CRITICAL',
            code: 'PHONE_RESTRICTED',
            title: 'Envio interrompido devido a restrição da plataforma.',
            detail: err.toUserMessage(),
            metadata: { phoneNumberId: phone.id, ...err.toLogObject() },
          },
        });
      }
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'FAILED',
          errorCode: err.metaErrorCode != null ? String(err.metaErrorCode) : null,
          errorMessage: err.message,
          fbtraceId: err.fbtraceId ?? null,
        },
      });
      logger.warn({ messageId, ...err.toLogObject() }, 'Falha no envio');
      if (err.retryable) throw err; // fila retenta transitórios (spec §27)
      return { status: 'FAILED', skipped: false };
    }
    await setFailed(prisma, messageId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function setFailed(prisma: PrismaClient, messageId: string, reason: string) {
  await prisma.message.update({
    where: { id: messageId },
    data: { status: 'FAILED', errorMessage: reason },
  });
}
