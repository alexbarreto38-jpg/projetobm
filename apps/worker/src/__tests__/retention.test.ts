import type { PrismaClient } from '@wise/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { retentionPurge } from '../processors/retention.js';
import { hasDb, makePrisma, resetDb } from './helpers.js';

describe.skipIf(!hasDb)('retentionPurge', () => {
  const prisma: PrismaClient = makePrisma();
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('remove mensagens/eventos antigos e preserva os recentes', async () => {
    const org = await prisma.organization.create({ data: { name: 'Org', slug: `org-${Date.now()}` } });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    await prisma.message.create({
      data: { organizationId: org.id, status: 'DELIVERED', idempotencyKey: 'old', createdAt: old },
    });
    await prisma.message.create({
      data: { organizationId: org.id, status: 'DELIVERED', idempotencyKey: 'new' },
    });
    await prisma.webhookEvent.create({
      data: { provider: 'meta', dedupeKey: 'old-wh', status: 'PROCESSED', rawPayload: {}, createdAt: old },
    });

    const result = await retentionPurge(prisma, 30);
    expect(result.deleted.messages).toBe(1);
    expect(result.deleted.webhookEvents).toBe(1);

    expect(await prisma.message.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
});
