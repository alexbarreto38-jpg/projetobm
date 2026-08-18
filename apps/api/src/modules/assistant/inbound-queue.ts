import type { NormalizedInbound } from '@wise/infobip-provider';
import { logger } from '@wise/logger';

/**
 * Fila de mensagens recebidas do WhatsApp (spec §3). Abstrai o processamento
 * assíncrono para que o webhook responda 200 imediatamente — evitando timeout e
 * reentrega pelo Infobip (spec §23).
 */
export interface InboundQueue {
  enqueue(inbound: NormalizedInbound): void;
  /** Profundidade atual — para métricas/testes. */
  size(): number;
}

/**
 * Implementação em processo: um único laço sequencial drena a fila em segundo
 * plano. Resolve o timeout do webhook sem exigir store compartilhado entre
 * processos.
 *
 * Escopo: instância única (os stores do provider Infobip são em memória). Para
 * múltiplas réplicas, troque por uma fila Redis/BullMQ + stores em Redis — a
 * interface `InboundQueue` permite a substituição sem mudar o webhook.
 */
export class InProcessInboundQueue implements InboundQueue {
  private readonly q: NormalizedInbound[] = [];
  private running = false;

  constructor(
    private readonly processor: (inbound: NormalizedInbound) => Promise<void>,
    private readonly maxDepth = 5000,
  ) {}

  enqueue(inbound: NormalizedInbound): void {
    if (this.q.length >= this.maxDepth) {
      // Backpressure: descarta e registra em vez de estourar a memória (spec §27).
      logger.error({ messageId: inbound.messageId }, 'Fila de entrada cheia — mensagem descartada.');
      return;
    }
    this.q.push(inbound);
    void this.drain();
  }

  size(): number {
    return this.q.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.q.length > 0) {
        const inbound = this.q.shift()!;
        try {
          await this.processor(inbound);
        } catch (error) {
          logger.error({ err: error, messageId: inbound.messageId }, 'Falha ao processar mensagem (fila).');
        }
      }
    } finally {
      this.running = false;
    }
  }
}
