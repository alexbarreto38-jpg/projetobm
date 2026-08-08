import { createHash } from 'node:crypto';
import { assertPermission, type AuthContext } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import type { ImportContactsInput } from '@wise/validation';
import { notFound } from '../../lib/errors.js';
import type { ContactImportEnqueuer } from '../../queue/enqueuer.js';

/**
 * ContactImportService (spec §40). Cria o job de importação e enfileira o
 * processamento em background — o arquivo NÃO é processado no request. O
 * processamento por streaming/batches acontece no worker.
 */
export class ContactImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enqueuer?: ContactImportEnqueuer,
  ) {}

  async createImport(ctx: AuthContext, organizationId: string, input: ImportContactsInput) {
    assertPermission(ctx, organizationId, 'contact:write');

    // Idempotência (spec §19): mesmo conteúdo não cria dois imports idênticos.
    const idempotencyKey = createHash('sha256')
      .update(`${organizationId}:${input.csv}`)
      .digest('hex');

    const existing = await this.prisma.contactImport.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const record = await this.prisma.contactImport.create({
      data: {
        organizationId,
        filename: input.filename,
        source: input.source ?? 'csv-import',
        sourceText: input.csv,
        status: 'PENDING',
        idempotencyKey,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: ctx.userId,
        action: 'CONTACTS_IMPORT_STARTED',
        entityType: 'contact_import',
        entityId: record.id,
      },
    });

    if (this.enqueuer) {
      try {
        await this.enqueuer.enqueue(record.id);
      } catch (err) {
        logger.error({ err, contactImportId: record.id }, 'Falha ao enfileirar importação');
      }
    } else {
      logger.warn({ contactImportId: record.id }, 'Sem enqueuer: importação não enfileirada');
    }

    return record;
  }

  async getImport(ctx: AuthContext, organizationId: string, importId: string) {
    assertPermission(ctx, organizationId, 'contact:read');
    const record = await this.prisma.contactImport.findFirst({
      where: { id: importId, organizationId },
    });
    if (!record) throw notFound('Importação não encontrada.');
    // Não expõe o conteúdo bruto do CSV na resposta.
    const { sourceText: _omit, ...rest } = record;
    return rest;
  }
}
