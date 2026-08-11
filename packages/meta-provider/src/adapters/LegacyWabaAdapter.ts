import type { AccountCapabilities } from '@wise/types';
import type { MetaGraphClient } from '../graph/MetaGraphClient.js';
import type {
  AccountInfo,
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
 * Adapter para o modelo LEGADO (WABA) — o modelo primário e GA hoje.
 *
 * Edges usados (confirmar na doc oficial ao implementar em detalhe):
 *   GET  /{waba-id}/phone_numbers
 *   GET  /{waba-id}/message_templates
 *   POST /{waba-id}/message_templates
 *   POST /{phone-number-id}/messages
 *   POST /{waba-id}/subscribed_apps
 * Referência: https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts
 */
export class LegacyWabaAdapter implements WhatsAppAccountAdapter {
  readonly model = 'LEGACY' as const;

  constructor(private readonly graph: MetaGraphClient) {}

  async detectCapabilities(_ctx: AdapterContext): Promise<AccountCapabilities> {
    // No modelo legado, templates vivem na WABA. Recursos do modelo novo ficam
    // desligados até que a detecção via API oficial confirme o contrário.
    return {
      legacyTemplates: true,
      messagingAccountTemplates: false,
      coexistence: false,
      phoneIdentitySeparation: false,
    };
  }

  async getAccountInfo(ctx: AdapterContext): Promise<AccountInfo> {
    const res = await this.graph.get<RawWaba>(`${ctx.externalAccountId}`, {
      accessToken: ctx.accessToken,
      requestId: ctx.requestId,
      query: { fields: 'id,name,currency,timezone_id,account_review_status' },
    });
    return {
      externalAccountId: res.id ?? ctx.externalAccountId,
      name: res.name,
      currency: res.currency,
      timezone: res.timezone_id,
      status: res.account_review_status,
    };
  }

  async listPhoneNumbers(ctx: AdapterContext): Promise<PhoneNumberInfo[]> {
    const res = await this.graph.get<{ data?: RawPhoneNumber[] }>(
      `${ctx.externalAccountId}/phone_numbers`,
      {
        accessToken: ctx.accessToken,
        requestId: ctx.requestId,
        query: {
          fields: 'id,display_phone_number,verified_name,quality_rating,status,throughput',
        },
      },
    );
    return (res.data ?? []).map((n) => ({
      externalPhoneNumberId: n.id,
      displayPhoneNumber: n.display_phone_number,
      verifiedName: n.verified_name,
      qualityStatus: n.quality_rating,
      platformStatus: n.status,
      messagingLimitInfo: n.throughput,
    }));
  }

  async listTemplates(ctx: AdapterContext): Promise<TemplateInfo[]> {
    const res = await this.graph.get<{ data?: RawTemplate[] }>(
      `${ctx.externalAccountId}/message_templates`,
      {
        accessToken: ctx.accessToken,
        requestId: ctx.requestId,
        query: { fields: 'id,name,language,category,status,components' },
      },
    );
    return (res.data ?? []).map(mapTemplate);
  }

  async createTemplate(ctx: AdapterContext, input: CreateTemplateInput): Promise<TemplateInfo> {
    const res = await this.graph.post<RawTemplate>(
      `${ctx.externalAccountId}/message_templates`,
      {
        accessToken: ctx.accessToken,
        requestId: ctx.requestId,
        body: {
          name: input.name,
          language: input.language,
          category: input.category,
          components: input.components,
        },
      },
    );
    return mapTemplate(res);
  }

  async sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendMessageResult> {
    const res = await this.graph.post<{ messages?: Array<{ id: string }> }>(
      `${input.fromPhoneNumberId}/messages`,
      {
        accessToken: ctx.accessToken,
        requestId: ctx.requestId,
        body: {
          messaging_product: 'whatsapp',
          to: input.toPhone,
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: input.templateLanguage },
            // A montagem dos components/parameters a partir de `variables` será
            // implementada na fase de mensagens, conforme a doc oficial.
          },
        },
      },
    );
    return { externalMessageId: res.messages?.[0]?.id };
  }

  async subscribeWebhooks(ctx: AdapterContext): Promise<void> {
    await this.graph.post(`${ctx.externalAccountId}/subscribed_apps`, {
      accessToken: ctx.accessToken,
      requestId: ctx.requestId,
    });
  }

  async getHealth(ctx: AdapterContext): Promise<HealthReport> {
    // Health mínimo: consegue listar números? Detalhes ricos virão na Fase 3/9.
    try {
      const numbers = await this.listPhoneNumbers(ctx);
      return {
        connection: true,
        permission: true,
        account: true,
        number: numbers.length > 0,
        webhook: true,
        templates: true,
      };
    } catch {
      return {
        connection: false,
        permission: false,
        account: false,
        number: false,
        webhook: false,
        templates: false,
      };
    }
  }
}

interface RawWaba {
  id?: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  account_review_status?: string;
}

interface RawPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  throughput?: unknown;
}

interface RawTemplate {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: unknown;
}

function mapTemplate(t: RawTemplate): TemplateInfo {
  return {
    externalTemplateId: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    components: t.components,
  };
}
