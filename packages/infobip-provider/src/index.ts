/**
 * @wise/infobip-provider — integração do Módulo 1 com o Infobip (spec §1).
 *
 * Implementa a mesma interface `AssistantBackend` do cérebro (@wise/assistant):
 * o assistente conversa igual, mas as ações rodam no Infobip. Cliente tipado da
 * API, backend, stores de lista/campanha e ingestão de relatórios de entrega.
 */
export * from './errors.js';
export * from './types.js';
export * from './client.js';
export * from './store.js';
export * from './backend.js';
