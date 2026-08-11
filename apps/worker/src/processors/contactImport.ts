import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import type { Prisma, PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import { normalizePhone, type CountryCode } from '@wise/validation';

/**
 * Importação de contatos em background (spec §40).
 *
 * Processa o CSV por STREAMING em lotes — nunca carrega 500 mil linhas na
 * memória. Normaliza telefone para E.164, deduplica por (org, telefone),
 * contabiliza importados/duplicados/inválidos/opt-out e atualiza o progresso.
 * Idempotente: um import que não está PENDING não é reprocessado.
 */
const BATCH_SIZE = 500;

export interface ImportSummary {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  optout: number;
  skipped: boolean;
}

export async function processContactImport(
  prisma: PrismaClient,
  contactImportId: string,
  defaultCountry: CountryCode = 'BR',
): Promise<ImportSummary> {
  const record = await prisma.contactImport.findUnique({ where: { id: contactImportId } });
  if (!record) throw new Error(`ContactImport ${contactImportId} não encontrado.`);
  if (record.status !== 'PENDING') {
    return { ...counters(record), skipped: true };
  }

  await prisma.contactImport.update({
    where: { id: contactImportId },
    data: { status: 'PROCESSING' },
  });

  const source: Readable = record.sourcePath
    ? createReadStream(record.sourcePath)
    : Readable.from(record.sourceText ?? '');

  const parser = source.pipe(
    parse({ columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), trim: true, skip_empty_lines: true }),
  );

  const totals = { totalRows: 0, imported: 0, duplicates: 0, invalid: 0, optout: 0 };
  let batch: RawRow[] = [];

  try {
    for await (const row of parser as AsyncIterable<RawRow>) {
      totals.totalRows += 1;
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await flush(prisma, record.organizationId, record.source, batch, defaultCountry, totals);
        batch = [];
        await persist(prisma, contactImportId, totals);
      }
    }
    if (batch.length > 0) {
      await flush(prisma, record.organizationId, record.source, batch, defaultCountry, totals);
    }

    await prisma.contactImport.update({
      where: { id: contactImportId },
      data: { ...totals, status: 'COMPLETED' },
    });
    logger.info({ contactImportId, ...totals }, 'Importação concluída');
    return { ...totals, skipped: false };
  } catch (err) {
    await prisma.contactImport.update({
      where: { id: contactImportId },
      data: {
        ...totals,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function flush(
  prisma: PrismaClient,
  organizationId: string,
  source: string | null,
  rows: RawRow[],
  defaultCountry: CountryCode,
  totals: { imported: number; duplicates: number; invalid: number; optout: number },
) {
  const seen = new Set<string>();
  const valid: { phone: string; name?: string; customFields: Record<string, unknown> }[] = [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone ?? '', defaultCountry);
    if (!phone) {
      totals.invalid += 1;
      continue;
    }
    if (seen.has(phone)) {
      totals.duplicates += 1; // duplicado dentro do próprio arquivo
      continue;
    }
    seen.add(phone);
    const { phone: _p, name, ...rest } = row;
    valid.push({ phone, name: name || undefined, customFields: rest });
  }

  if (valid.length === 0) return;

  const phones = valid.map((v) => v.phone);
  const existing = await prisma.contact.findMany({
    where: { organizationId, phone: { in: phones } },
    select: { id: true, phone: true },
  });
  const existingByPhone = new Map(existing.map((e) => [e.phone, e.id]));

  const newRows = valid.filter((v) => !existingByPhone.has(v.phone));
  totals.duplicates += valid.length - newRows.length;

  if (newRows.length > 0) {
    const created = await prisma.contact.createMany({
      data: newRows.map((v) => ({
        organizationId,
        phone: v.phone,
        name: v.name,
        source: source ?? 'csv-import',
        customFields: v.customFields as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    totals.imported += created.count;
  }

  // Opt-out: telefones que já correspondem a contatos na lista de exclusão.
  const existingIds = existing.map((e) => e.id);
  if (existingIds.length > 0) {
    totals.optout += await prisma.contactOptout.count({
      where: { organizationId, contactId: { in: existingIds } },
    });
  }
}

async function persist(
  prisma: PrismaClient,
  id: string,
  totals: { totalRows: number; imported: number; duplicates: number; invalid: number; optout: number },
) {
  await prisma.contactImport.update({ where: { id }, data: { ...totals } });
}

function counters(r: {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  optout: number;
}) {
  return {
    totalRows: r.totalRows,
    imported: r.imported,
    duplicates: r.duplicates,
    invalid: r.invalid,
    optout: r.optout,
  };
}

interface RawRow {
  phone?: string;
  name?: string;
  [key: string]: string | undefined;
}
