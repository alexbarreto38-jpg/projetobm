import type { AccountCapabilities } from '@wise/types';

/**
 * Interface conceitual do adapter (spec §59). O restante do sistema NÃO precisa
 * saber qual modelo Meta (legado WABA ou novo modelo 2026) está por trás.
 *
 * Os tipos abaixo são propositalmente mínimos/genéricos: os campos exatos
 * (nomes, IDs, edges) devem ser confirmados na documentação oficial da Meta no
 * momento da implementação de cada método. Não inventamos endpoints aqui.
 */
export interface PhoneNumberInfo {
  externalPhoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityStatus?: string;
  platformStatus?: string;
  messagingLimitInfo?: unknown;
}

export interface TemplateInfo {
  externalTemplateId?: string;
  name: string;
  language: string;
  category: string;
  status: string; // estado bruto da Meta; mapeado para DeploymentStatus na app
  components?: unknown;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: string;
  components: unknown;
  /** Idempotência (spec §19). */
  idempotencyKey: string;
}

export interface SendMessageInput {
  toPhone: string;
  templateName: string;
  templateLanguage: string;
  variables?: Record<string, string>;
  /** ID do número de origem (ativo autorizado). */
  fromPhoneNumberId: string;
  /** Idempotência (spec §19). */
  idempotencyKey: string;
}

export interface SendMessageResult {
  externalMessageId?: string; // wamid
}

export interface AccountInfo {
  externalAccountId: string;
  name?: string;
  currency?: string;
  timezone?: string;
  /** Estado bruto da conta reportado pela Meta, quando disponível. */
  status?: string;
}

export interface HealthReport {
  connection: boolean;
  permission: boolean;
  account: boolean;
  number: boolean;
  webhook: boolean;
  templates: boolean;
  details?: Record<string, string>;
}

export interface AdapterContext {
  externalAccountId: string;
  accessToken: string;
  requestId?: string;
}

export interface WhatsAppAccountAdapter {
  readonly model: 'LEGACY' | 'NEW_MODEL';

  detectCapabilities(ctx: AdapterContext): Promise<AccountCapabilities>;
  getAccountInfo(ctx: AdapterContext): Promise<AccountInfo>;
  listPhoneNumbers(ctx: AdapterContext): Promise<PhoneNumberInfo[]>;
  listTemplates(ctx: AdapterContext): Promise<TemplateInfo[]>;
  createTemplate(ctx: AdapterContext, input: CreateTemplateInput): Promise<TemplateInfo>;
  sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendMessageResult>;
  subscribeWebhooks(ctx: AdapterContext): Promise<void>;
  getHealth(ctx: AdapterContext): Promise<HealthReport>;
}
