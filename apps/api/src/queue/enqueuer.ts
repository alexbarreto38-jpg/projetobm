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

/** Enfileira o processamento de uma campanha (fila campaign-processing). */
export interface CampaignProcessingEnqueuer {
  enqueue(campaignId: string): Promise<void>;
}

/** Enfileira o envio de uma mensagem (fila message-send). */
export interface MessageSendEnqueuer {
  enqueue(messageId: string): Promise<void>;
}

/** Reenfileira um job a partir do nome da fila + id da entidade (dead-letter §56). */
export type Requeuers = Partial<Record<string, (entityId: string) => Promise<void>>>;
