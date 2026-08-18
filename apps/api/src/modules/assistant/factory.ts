import type { AppConfig } from '../../app.js';
import { AssistantService } from './service.js';

/**
 * Uma única instância de AssistantService por configuração da app. Compartilhar
 * a instância garante que o canal de entrada (WhatsApp) e a rota REST usem o
 * MESMO store de conversa — a operação continua entre canais (spec §5).
 */
const cache = new WeakMap<AppConfig, AssistantService | null>();

export function getAssistantService(config: AppConfig): AssistantService | null {
  if (cache.has(config)) return cache.get(config) ?? null;
  const service = config.assistantLlm
    ? new AssistantService({
        prisma: config.prisma,
        llm: config.assistantLlm,
        backend: config.infobipAssistant?.backend,
        allocateCampaignId: config.infobipAssistant?.allocateCampaignId,
      })
    : null;
  cache.set(config, service);
  return service;
}
