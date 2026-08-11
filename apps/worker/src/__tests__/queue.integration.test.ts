import type { PrismaClient } from '@wise/database';
import {
  createQueue,
  createRedisConnection,
  createWorker,
  QUEUE_NAMES,
  type Worker,
} from '@wise/queue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processWebhookEvent } from '../processors/webhook.js';
import { hasDb, makePrisma, resetDb, seedAccount } from './helpers.js';

const REDIS_URL = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL;
const enabled = hasDb && Boolean(REDIS_URL);

describe.skipIf(!enabled)('BullMQ round-trip: enqueue → worker → processor', () => {
  const prisma: PrismaClient = makePrisma();
  const connection = createRedisConnection(REDIS_URL!);
  let worker: Worker<{ webhookEventId: string }>;

  beforeAll(async () => {
    await resetDb(prisma);
    // Limpa jobs residuais da fila neste Redis de teste.
    const q = createQueue(QUEUE_NAMES.webhookProcessing, connection);
    await q.obliterate({ force: true });
    await q.close();

    worker = createWorker(
      QUEUE_NAMES.webhookProcessing,
      async (job) => processWebhookEvent(prisma, job.data.webhookEventId),
      connection,
    );
  });

  afterAll(async () => {
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
  });

  it('processa um job real da fila e marca o evento como PROCESSED', async () => {
    const { org } = await seedAccount(prisma);
    await prisma.message.create({
      data: {
        organizationId: org.id,
        idempotencyKey: 'q-msg-1',
        externalMessageId: 'wamid.QUEUE',
        status: 'SENT',
      },
    });
    const event = await prisma.webhookEvent.create({
      data: {
        provider: 'meta',
        eventType: 'messages',
        dedupeKey: `q-${Date.now()}`,
        status: 'RECEIVED',
        rawPayload: {
          entry: [
            {
              changes: [
                {
                  field: 'messages',
                  value: { statuses: [{ id: 'wamid.QUEUE', status: 'read', timestamp: '1700000003' }] },
                },
              ],
            },
          ],
        },
      },
    });

    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout aguardando job')), 15_000);
      worker.on('completed', (job) => {
        if (job.data.webhookEventId === event.id) {
          clearTimeout(timer);
          resolve();
        }
      });
      worker.on('failed', (_job, err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const queue = createQueue(QUEUE_NAMES.webhookProcessing, connection);
    await queue.add('process', { webhookEventId: event.id }, { jobId: `webhook_${event.id}` });

    await completed;
    await queue.close();

    const updated = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
    expect(updated?.status).toBe('PROCESSED');
    const msg = await prisma.message.findFirst({ where: { externalMessageId: 'wamid.QUEUE' } });
    expect(msg?.status).toBe('READ');
  });
});
