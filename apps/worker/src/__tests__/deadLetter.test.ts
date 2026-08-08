import type { PrismaClient } from '@wise/database';
import { QUEUE_NAMES } from '@wise/queue';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isFinalAttempt, recordDeadLetter } from '../deadLetter.js';
import { hasDb, makePrisma, resetDb } from './helpers.js';

describe('isFinalAttempt', () => {
  it('true só quando esgotou as tentativas', () => {
    expect(isFinalAttempt(4, 5)).toBe(false);
    expect(isFinalAttempt(5, 5)).toBe(true);
    expect(isFinalAttempt(1, undefined)).toBe(true);
  });
});

describe.skipIf(!hasDb)('recordDeadLetter', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registra o job e deriva a organização pela mensagem', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Org', slug: `org-${Date.now()}` },
    });
    const message = await prisma.message.create({
      data: { organizationId: org.id, status: 'FAILED', idempotencyKey: 'dl-msg-1' },
    });

    await recordDeadLetter(prisma, {
      queue: QUEUE_NAMES.messageSend,
      jobId: 'message_x',
      reason: 'permanent error',
      data: { messageId: message.id },
    });

    const entries = await prisma.deadLetterJob.findMany({ where: { organizationId: org.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.queue).toBe('message-send');
    expect(entries[0]!.reason).toBe('permanent error');
  });
});
