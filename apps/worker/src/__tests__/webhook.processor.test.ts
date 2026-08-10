import type { PrismaClient } from '@wise/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processWebhookEvent } from '../processors/webhook.js';
import { hasDb, makePrisma, resetDb, seedAccount } from './helpers.js';

describe.skipIf(!hasDb)('processWebhookEvent', () => {
  const prisma: PrismaClient = makePrisma();

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function storeEvent(payload: unknown) {
    return prisma.webhookEvent.create({
      data: {
        provider: 'meta',
        eventType: 'messages',
        dedupeKey: `k-${Date.now()}-${Math.random()}`,
        status: 'RECEIVED',
        rawPayload: payload as object,
      },
    });
  }

  it('atualiza status de mensagem e cria MessageEvent preservando o raw', async () => {
    const { org } = await seedAccount(prisma);
    const message = await prisma.message.create({
      data: {
        organizationId: org.id,
        idempotencyKey: 'msg-1',
        externalMessageId: 'wamid.ABC',
        status: 'SENT',
      },
    });

    const event = await storeEvent({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  { id: 'wamid.ABC', status: 'delivered', timestamp: '1700000000', recipient_id: '55119' },
                ],
              },
            },
          ],
        },
      ],
    });

    const summary = await processWebhookEvent(prisma, event.id);
    expect(summary.statusesProcessed).toBe(1);

    const updated = await prisma.message.findUnique({ where: { id: message.id } });
    expect(updated?.status).toBe('DELIVERED');

    const events = await prisma.messageEvent.findMany({ where: { messageId: message.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe('delivered');
    expect((events[0]!.rawPayload as { id?: string }).id).toBe('wamid.ABC');

    const wh = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
    expect(wh?.status).toBe('PROCESSED');
  });

  it('marca FAILED com erro quando status é failed', async () => {
    const { org } = await seedAccount(prisma);
    await prisma.message.create({
      data: {
        organizationId: org.id,
        idempotencyKey: 'msg-2',
        externalMessageId: 'wamid.FAIL',
        status: 'SENT',
      },
    });
    const event = await storeEvent({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: 'wamid.FAIL',
                    status: 'failed',
                    timestamp: '1700000001',
                    errors: [{ code: 131049, title: 'Mensagem não entregue' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    await processWebhookEvent(prisma, event.id);
    const msg = await prisma.message.findFirst({ where: { externalMessageId: 'wamid.FAIL' } });
    expect(msg?.status).toBe('FAILED');
    expect(msg?.errorCode).toBe('131049');
  });

  it('atualiza status de template (deployment) por externalTemplateId', async () => {
    const { org, account } = await seedAccount(prisma);
    const template = await prisma.template.create({
      data: {
        organizationId: org.id,
        name: 'cobranca_v1',
        language: 'pt_BR',
        category: 'UTILITY',
        components: {},
      },
    });
    await prisma.templateDeployment.create({
      data: {
        organizationId: org.id,
        templateId: template.id,
        targetAccountId: account.id,
        externalTemplateId: 'TPL_123',
        status: 'PENDING',
        idempotencyKey: 'dep-1',
      },
    });

    const event = await storeEvent({
      entry: [
        {
          changes: [
            {
              field: 'message_template_status_update',
              value: { message_template_id: 'TPL_123', event: 'APPROVED' },
            },
          ],
        },
      ],
    });
    const summary = await processWebhookEvent(prisma, event.id);
    expect(summary.templatesProcessed).toBe(1);

    const dep = await prisma.templateDeployment.findFirst({
      where: { externalTemplateId: 'TPL_123' },
    });
    expect(dep?.status).toBe('APPROVED');
  });

  it('pausa o número e alerta quando a Meta sinaliza queda de qualidade (§25)', async () => {
    const { org, account } = await seedAccount(prisma);
    const phone = await prisma.phoneNumber.create({
      data: {
        organizationId: org.id,
        whatsappAccountId: account.id,
        externalPhoneNumberId: 'PN_1',
        displayPhoneNumber: '+55 11 90000-0001',
        isPaused: false,
      },
    });

    const event = await storeEvent({
      entry: [
        {
          id: account.externalAccountId,
          changes: [
            {
              field: 'phone_number_quality_update',
              value: {
                // formatação diferente da armazenada — casa por dígitos
                display_phone_number: '5511900000001',
                event: 'FLAGGED',
                current_limit: 'TIER_1K',
              },
            },
          ],
        },
      ],
    });

    const summary = await processWebhookEvent(prisma, event.id);
    expect(summary.qualityProcessed).toBe(1);

    const updated = await prisma.phoneNumber.findUnique({ where: { id: phone.id } });
    expect(updated?.isPaused).toBe(true);

    const alerts = await prisma.systemAlert.findMany({
      where: { organizationId: org.id, code: 'PHONE_QUALITY_FLAGGED' },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe('CRITICAL');
  });

  it('é idempotente: reprocessar um evento PROCESSED não duplica MessageEvent', async () => {
    const { org } = await seedAccount(prisma);
    const message = await prisma.message.create({
      data: {
        organizationId: org.id,
        idempotencyKey: 'msg-3',
        externalMessageId: 'wamid.IDMP',
        status: 'SENT',
      },
    });
    const event = await storeEvent({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: { statuses: [{ id: 'wamid.IDMP', status: 'read', timestamp: '1700000002' }] },
            },
          ],
        },
      ],
    });

    await processWebhookEvent(prisma, event.id);
    const second = await processWebhookEvent(prisma, event.id);
    expect(second.skipped).toBe(true);

    const events = await prisma.messageEvent.findMany({ where: { messageId: message.id } });
    expect(events).toHaveLength(1);
  });
});
