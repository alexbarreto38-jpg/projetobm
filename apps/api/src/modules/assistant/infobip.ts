import { formatCampaignId } from '@wise/assistant';
import type { AssistantBackend } from '@wise/assistant';
import {
  InfobipAssistantBackend,
  InfobipClient,
  InMemoryCampaignStore,
  InMemoryContactListStore,
  type CampaignStore,
  type ContactListStore,
  type InfobipSenderConfig,
} from '@wise/infobip-provider';
import { logger } from '@wise/logger';
import type { CountryCode } from '@wise/validation';

/**
 * Constrói o backend do assistente sobre o Infobip a partir do ambiente
 * (spec §1). Retorna null quando não configurado — a API cai no backend Meta.
 *
 * Os stores de lista/campanha são em memória (MVP, uma instância). Em produção,
 * troque por Redis/Postgres. A rota de webhook de entrega alimenta o
 * CampaignStore com o andamento real (spec §16, §31).
 */
export interface InfobipAssistantModule {
  backend: AssistantBackend;
  lists: ContactListStore;
  campaigns: CampaignStore;
  allocateCampaignId: (organizationId: string) => Promise<string>;
}

export interface InfobipAssistantEnv {
  INFOBIP_BASE_URL?: string;
  INFOBIP_API_KEY?: string;
  INFOBIP_SENDERS?: string; // JSON: [{ "id": "...", "number": "5511...", "label": "..." }]
  INFOBIP_PRICE_PER_MESSAGE?: number;
  INFOBIP_DEFAULT_COUNTRY?: string;
}

export function buildInfobipAssistant(env: InfobipAssistantEnv): InfobipAssistantModule | null {
  if (!env.INFOBIP_BASE_URL || !env.INFOBIP_API_KEY) return null;

  const senders = parseSenders(env.INFOBIP_SENDERS);
  if (senders.length === 0) {
    logger.warn('INFOBIP_SENDERS ausente/vazio — assistente Infobip sem remetentes configurados.');
  }

  const lists = new InMemoryContactListStore();
  const campaigns = new InMemoryCampaignStore();
  const client = new InfobipClient({ baseUrl: env.INFOBIP_BASE_URL, apiKey: env.INFOBIP_API_KEY });

  const backend = new InfobipAssistantBackend({
    client,
    senders,
    lists,
    campaigns,
    pricePerMessage: env.INFOBIP_PRICE_PER_MESSAGE,
    defaultCountry: (env.INFOBIP_DEFAULT_COUNTRY as CountryCode | undefined) ?? undefined,
    audit: (_ctx, entry) => {
      logger.info({ action: entry.action, entityId: entry.entityId }, 'assistant/infobip audit');
    },
  });

  // Sequência simples por organização, em memória (o Infobip não tem tabela de
  // campanhas neste provider). Suficiente para o id humano (spec §23).
  const counters = new Map<string, number>();
  const allocateCampaignId = (organizationId: string): Promise<string> => {
    const next = (counters.get(organizationId) ?? 0) + 1;
    counters.set(organizationId, next);
    return Promise.resolve(formatCampaignId(new Date().getFullYear(), next));
  };

  logger.info({ senders: senders.length }, 'Assistente Infobip habilitado.');
  return { backend, lists, campaigns, allocateCampaignId };
}

function parseSenders(raw: string | undefined): InfobipSenderConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is InfobipSenderConfig =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as InfobipSenderConfig).id === 'string' &&
          typeof (s as InfobipSenderConfig).number === 'string',
      )
      .map((s) => ({ id: s.id, number: s.number, label: s.label ?? s.number }));
  } catch {
    logger.warn('INFOBIP_SENDERS inválido (JSON malformado) — ignorado.');
    return [];
  }
}
