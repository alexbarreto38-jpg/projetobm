/**
 * Abstração de enfileiramento. A API só enfileira; o processamento pesado fica
 * nos workers (spec §30). Injetável para permitir uma implementação BullMQ em
 * produção e um fake em testes (sem Redis).
 */
export interface WebhookEnqueuer {
  enqueue(webhookEventId: string): Promise<void>;
}

/** Enfileira submissões de template (fila meta-template-deployment — spec §26). */
export interface TemplateDeploymentEnqueuer {
  enqueue(deploymentId: string): Promise<void>;
}

/** Enfileira importações de contatos (fila contact-import — spec §40). */
export interface ContactImportEnqueuer {
  enqueue(contactImportId: string): Promise<void>;
}
