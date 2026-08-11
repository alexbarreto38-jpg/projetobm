import { createHash } from 'node:crypto';
import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import type { MetaContext } from '../../meta/context.js';
import type { WebhookEnqueuer } from '../../queue/enqueuer.js';
import { unauthorized } from '../../lib/errors.js';

export interface IngestResult {
  deduped: boolean;
  webhookEventId?: string;
}

/**
 * Ingestão de webhook (spec §30, §51). Fluxo: verificar assinatura → deduplicar
 * → persistir evento bruto → enfileirar → responder rápido. Nunca processa
 * lógica pesada aqui.
 */
export class WebhookIngestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly meta: MetaContext,
    private readonly enqueuer?: WebhookEnqueuer,
  ) {}

  async ingest(rawBody: Buffer, signatureHeader: string | undefined): Promise<IngestResult> {
    // 1) Verificação da origem via assinatura X-Hub-Signature-256 (App Secret).
    const valid = this.meta.provider.webhooks.verifySignature(rawBody, signatureHeader);
    if (!valid) {
      throw unauthorized('Assinatura de webhook inválida.');
    }

    // 2) Parse do payload (após verificar a assinatura sobre o corpo bruto).
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw unauthorized('Payload de webhook inválido.');
    }

    // 3) Dedupe determinístico: hash do corpo bruto (redeliveries idênticas).
    const dedupeKey = createHash('sha256').update(rawBody).digest('hex');
    const eventType = detectEventType(payload);

    // 4) Persistência idempotente. Violação de unique => já visto.
    try {
      const event = await this.prisma.webhookEvent.create({
        data: {
          provider: 'meta',
          eventType,
          dedupeKey,
          status: 'RECEIVED',
          rawPayload: payload as object,
        },
      });

      // 5) Enfileira o processamento (best-effort — o evento já está persistido).
      if (this.enqueuer) {
        try {
          await this.enqueuer.enqueue(event.id);
        } catch (err) {
          logger.error({ err, webhookEventId: event.id }, 'Falha ao enfileirar webhook');
        }
      } else {
        logger.warn({ webhookEventId: event.id }, 'Sem enqueuer: webhook não enfileirado');
      }

      return { deduped: false, webhookEventId: event.id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { deduped: true };
      }
      throw err;
    }
  }

  /** Handshake GET do webhook (spec §30). */
  verifyChallenge(mode?: string, token?: string, challenge?: string): string | null {
    return this.meta.provider.webhooks.verifyChallenge(
      { mode, token, challenge },
      this.meta.webhookVerifyToken ?? '',
    );
  }
}

function detectEventType(payload: unknown): string | undefined {
  const entry = (payload as { entry?: Array<{ changes?: Array<{ field?: string }> }> })?.entry;
  return entry?.[0]?.changes?.[0]?.field;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}
