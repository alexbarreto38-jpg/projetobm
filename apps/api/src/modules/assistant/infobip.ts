import {
  formatCampaignId,
  HttpTranscriber,
  UnavailableTranscriber,
  type AssistantBackend,
  type Transcriber,
} from '@wise/assistant';
import type { AuthContext } from '@wise/auth';
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
import { ROLES, type RoleName } from '@wise/types';
import type { CountryCode } from '@wise/validation';

/**
 * Constrói o backend do assistente sobre o Infobip a partir do ambiente
 * (spec §1). Retorna null quando não configurado — a API cai no backend Meta.
 *
 * Os stores de lista/campanha são em memória (MVP, uma instância). Em produção,
 * troque por Redis/Postgres. A rota de webhook de entrega alimenta o
 * CampaignStore com o andamento real (spec §16, §31).
 */
/** Resolve o telefone do WhatsApp para um usuário autenticado (spec §3, §19). */
export type WhatsAppUserResolver = (phone: string) => AuthContext | null;

export interface InfobipAssistantModule {
  backend: AssistantBackend;
  lists: ContactListStore;
  campaigns: CampaignStore;
  allocateCampaignId: (organizationId: string) => Promise<string>;
  /** Cliente Infobip para o canal de entrada (baixar mídia, responder). */
  client: InfobipClient;
  senders: InfobipSenderConfig[];
  /** Transcrição de áudio recebido (spec §3). */
  transcriber: Transcriber;
  /** Identidade do remetente do WhatsApp (spec §19). */
  resolveUser: WhatsAppUserResolver;
}

export interface InfobipAssistantEnv {
  INFOBIP_BASE_URL?: string;
  INFOBIP_API_KEY?: string;
  INFOBIP_SENDERS?: string; // JSON: [{ "id": "...", "number": "5511...", "label": "..." }]
  INFOBIP_PRICE_PER_MESSAGE?: number;
  INFOBIP_DEFAULT_COUNTRY?: string;
  INFOBIP_INBOUND_USERS?: string; // JSON: [{phone,userId,organizationId,role,email?}]
  TRANSCRIBE_URL?: string;
  TRANSCRIBE_API_KEY?: string;
  TRANSCRIBE_MODEL?: string;
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

  const transcriber: Transcriber =
    env.TRANSCRIBE_URL !== undefined
      ? new HttpTranscriber({
          url: env.TRANSCRIBE_URL,
          apiKey: env.TRANSCRIBE_API_KEY,
          model: env.TRANSCRIBE_MODEL,
          language: 'pt',
        })
      : new UnavailableTranscriber();

  const resolveUser = buildUserResolver(env.INFOBIP_INBOUND_USERS);

  logger.info({ senders: senders.length }, 'Assistente Infobip habilitado.');
  return { backend, lists, campaigns, allocateCampaignId, client, senders, transcriber, resolveUser };
}

interface InboundUserConfig {
  phone: string;
  userId: string;
  organizationId: string;
  role: RoleName;
  email?: string;
}

/**
 * Constrói o resolvedor de identidade do canal a partir de uma allowlist
 * (spec §19). Sem entrada correspondente, o remetente não é autorizado — o canal
 * responde educadamente e nada é executado.
 */
function buildUserResolver(raw: string | undefined): WhatsAppUserResolver {
  const users = parseInboundUsers(raw);
  const byPhone = new Map<string, InboundUserConfig>();
  for (const u of users) byPhone.set(normalizePhoneKey(u.phone), u);

  return (phone: string): AuthContext | null => {
    const u = byPhone.get(normalizePhoneKey(phone));
    if (!u) return null;
    return {
      userId: u.userId,
      email: u.email ?? `${normalizePhoneKey(u.phone)}@whatsapp.local`,
      isSuperAdmin: false,
      memberships: { [u.organizationId]: u.role },
    };
  };
}

function parseInboundUsers(raw: string | undefined): InboundUserConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is InboundUserConfig => {
      const c = u as Partial<InboundUserConfig>;
      return (
        typeof c.phone === 'string' &&
        typeof c.userId === 'string' &&
        typeof c.organizationId === 'string' &&
        typeof c.role === 'string' &&
        (ROLES as readonly string[]).includes(c.role)
      );
    });
  } catch {
    logger.warn('INFOBIP_INBOUND_USERS inválido (JSON malformado) — ignorado.');
    return [];
  }
}

/** Compara telefones só pelos dígitos (tolera +, espaços, etc.). */
function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, '');
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
