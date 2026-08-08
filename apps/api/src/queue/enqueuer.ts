/**
 * Abstração de enfileiramento. A API só enfileira; o processamento pesado fica
 * nos workers (spec §30). Injetável para permitir uma implementação BullMQ em
 * produção e um fake em testes (sem Redis).
 */
export interface WebhookEnqueuer {
  enqueue(webhookEventId: string): Promise<void>;
}
