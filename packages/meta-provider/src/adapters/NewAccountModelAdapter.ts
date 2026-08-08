import type { AccountCapabilities } from '@wise/types';
import type { MetaGraphClient } from '../graph/MetaGraphClient.js';
import { MetaApiError } from '../errors/MetaApiError.js';
import type {
  AdapterContext,
  CreateTemplateInput,
  HealthReport,
  PhoneNumberInfo,
  SendMessageInput,
  SendMessageResult,
  TemplateInfo,
  WhatsAppAccountAdapter,
} from './WhatsAppAccountAdapter.js';

/**
 * Adapter para o NOVO MODELO de contas anunciado pela Meta em 2026
 * (separação identidade/número + Messaging Account; usernames/BSUID).
 *
 * ESTADO: em transição/rollout ao longo de 2026. Os nomes exatos de objetos,
 * IDs, edges e webhooks do modelo novo NÃO estão consolidados em API GA e
 * portanto NÃO são inventados aqui. Cada método permanece como ponto de
 * extensão explícito, lançando um erro claro até que a doc oficial seja
 * confirmada e o método seja implementado + testado (spec §4, §57, §66).
 *
 * A ativação acontece por capability detection (preferencial) e/ou feature
 * flags (META_NEW_ACCOUNT_MODEL / META_NEW_MESSAGING_ACCOUNT).
 *
 * Referências a acompanhar:
 *  - https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
 *  - Changelog da Graph API para o modelo de contas 2026.
 */
export class NewAccountModelAdapter implements WhatsAppAccountAdapter {
  readonly model = 'NEW_MODEL' as const;

  constructor(private readonly _graph: MetaGraphClient) {}

  async detectCapabilities(_ctx: AdapterContext): Promise<AccountCapabilities> {
    return {
      legacyTemplates: false,
      messagingAccountTemplates: true,
      coexistence: false,
      phoneIdentitySeparation: true,
    };
  }

  async listPhoneNumbers(_ctx: AdapterContext): Promise<PhoneNumberInfo[]> {
    throw notImplemented('listPhoneNumbers');
  }

  async listTemplates(_ctx: AdapterContext): Promise<TemplateInfo[]> {
    throw notImplemented('listTemplates');
  }

  async createTemplate(_ctx: AdapterContext, _input: CreateTemplateInput): Promise<TemplateInfo> {
    throw notImplemented('createTemplate');
  }

  async sendMessage(_ctx: AdapterContext, _input: SendMessageInput): Promise<SendMessageResult> {
    throw notImplemented('sendMessage');
  }

  async subscribeWebhooks(_ctx: AdapterContext): Promise<void> {
    throw notImplemented('subscribeWebhooks');
  }

  async getHealth(_ctx: AdapterContext): Promise<HealthReport> {
    throw notImplemented('getHealth');
  }
}

function notImplemented(method: string): MetaApiError {
  return new MetaApiError({
    category: 'UNKNOWN',
    retryable: false,
    message:
      `NewAccountModelAdapter.${method} ainda não implementado: o modelo de contas ` +
      `2026 está em transição e seus endpoints devem ser confirmados na documentação ` +
      `oficial antes da implementação. Use o LegacyWabaAdapter para contas GA.`,
  });
}
