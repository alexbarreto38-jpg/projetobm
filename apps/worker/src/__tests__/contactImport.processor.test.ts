import { createHash } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processContactImport } from '../processors/contactImport.js';
import { hasDb, makePrisma, resetDb } from './helpers.js';

describe.skipIf(!hasDb)('processContactImport', () => {
  const prisma: PrismaClient = makePrisma();

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeImport(csv: string, organizationId: string) {
    return prisma.contactImport.create({
      data: {
        organizationId,
        sourceText: csv,
        status: 'PENDING',
        idempotencyKey: createHash('sha256').update(`${organizationId}:${csv}`).digest('hex'),
      },
    });
  }

  async function org() {
    return prisma.organization.create({
      data: { name: 'Org', slug: `org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
  }

  it('importa contatos válidos, normaliza e contabiliza inválidos/duplicados', async () => {
    const o = await org();
    const csv = [
      'phone,name,city',
      '(11) 99000-0001,Ana,SP', // válido
      '11990000001,Ana Repetida,SP', // duplicado (mesmo número normalizado)
      '11990000002,Bruno,RJ', // válido
      '123,Inválido,XX', // inválido
      '11990000003,Carla,MG', // válido
    ].join('\n');
    const imp = await makeImport(csv, o.id);

    const summary = await processContactImport(prisma, imp.id);
    expect(summary.totalRows).toBe(5);
    expect(summary.imported).toBe(3);
    expect(summary.duplicates).toBe(1);
    expect(summary.invalid).toBe(1);

    const contacts = await prisma.contact.findMany({ where: { organizationId: o.id } });
    expect(contacts).toHaveLength(3);
    const phones = contacts.map((c) => c.phone).sort();
    expect(phones).toEqual(['+5511990000001', '+5511990000002', '+5511990000003']);
    // custom_fields captura colunas extras.
    const ana = contacts.find((c) => c.phone === '+5511990000001');
    expect((ana?.customFields as { city?: string }).city).toBe('SP');

    const record = await prisma.contactImport.findUnique({ where: { id: imp.id } });
    expect(record?.status).toBe('COMPLETED');
  });

  it('conta como duplicado um telefone que já existe na organização', async () => {
    const o = await org();
    await prisma.contact.create({
      data: { organizationId: o.id, phone: '+5511990000001' },
    });
    const imp = await makeImport('phone\n11990000001\n11990000002\n', o.id);
    const summary = await processContactImport(prisma, imp.id);
    expect(summary.imported).toBe(1);
    expect(summary.duplicates).toBe(1);
  });

  it('contabiliza opt-out quando o telefone corresponde a contato excluído', async () => {
    const o = await org();
    const c = await prisma.contact.create({
      data: { organizationId: o.id, phone: '+5511990000001' },
    });
    await prisma.contactOptout.create({ data: { organizationId: o.id, contactId: c.id } });
    const imp = await makeImport('phone\n11990000001\n', o.id);
    const summary = await processContactImport(prisma, imp.id);
    expect(summary.optout).toBe(1);
    expect(summary.duplicates).toBe(1); // já existia
  });

  it('é idempotente: reprocessar um import não-PENDING é pulado', async () => {
    const o = await org();
    const imp = await makeImport('phone\n11990000001\n', o.id);
    await processContactImport(prisma, imp.id);
    const second = await processContactImport(prisma, imp.id);
    expect(second.skipped).toBe(true);
    const contacts = await prisma.contact.count({ where: { organizationId: o.id } });
    expect(contacts).toBe(1);
  });
});
