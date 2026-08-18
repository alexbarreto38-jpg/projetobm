import { InfobipApiError } from './errors.js';
import type {
  InfobipBalance,
  InfobipOutboundTemplateMessage,
  InfobipSendResponse,
  InfobipTemplate,
  InfobipTemplatesResponse,
} from './types.js';

/**
 * Cliente tipado da API do Infobip (spec §1, §26). Usa `fetch` (Node ≥ 18) —
 * sem SDK — e autentica com o esquema oficial `Authorization: App <API_KEY>`.
 * A base URL é específica da conta (ex.: https://xxxxx.api.infobip.com) e a
 * chave vive só no backend, nunca no frontend (spec §8, §46).
 */
export interface InfobipClientConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class InfobipClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: InfobipClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** Saldo da conta (spec §11). O Infobip expõe isto — diferente da Meta. */
  async getBalance(): Promise<InfobipBalance> {
    return this.request<InfobipBalance>('GET', '/account/1/balance');
  }

  /** Templates de WhatsApp registrados para um sender (spec §9). */
  async listTemplates(sender: string): Promise<InfobipTemplate[]> {
    const path = `/whatsapp/2/senders/${encodeURIComponent(sender)}/templates`;
    const res = await this.request<InfobipTemplatesResponse>('GET', path);
    return res.templates ?? [];
  }

  /** Envio em lote de mensagens de template (spec §15, §54). */
  async sendTemplateMessages(
    messages: InfobipOutboundTemplateMessage[],
  ): Promise<InfobipSendResponse> {
    return this.request<InfobipSendResponse>('POST', '/whatsapp/1/message/template', { messages });
  }

  /**
   * Envia uma mensagem de texto de sessão (spec §3, §16). Usado pelo canal de
   * entrada para responder ao usuário no WhatsApp dentro da janela de 24h.
   */
  async sendTextMessage(params: { from: string; to: string; text: string }): Promise<InfobipSendResponse> {
    return this.request<InfobipSendResponse>('POST', '/whatsapp/1/message/text', {
      from: params.from,
      to: params.to,
      content: { text: params.text },
    });
  }

  /**
   * Baixa uma mídia recebida (áudio/arquivo) usando a mesma autenticação da API
   * (spec §3). Retorna os bytes e o content-type para transcrição/processamento.
   */
  async downloadMedia(url: string): Promise<{ data: Uint8Array; contentType: string }> {
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { authorization: `App ${this.apiKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new InfobipApiError(res.status, undefined, detail.slice(0, 200));
    }
    const buffer = new Uint8Array(await res.arrayBuffer());
    return { data: buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `App ${this.apiKey}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const detail = extractError(json) ?? text.slice(0, 300);
      throw new InfobipApiError(res.status, extractMessageId(json), detail, json);
    }
    return json as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** O Infobip retorna erros em `requestError.serviceException.text`. */
function extractError(json: unknown): string | undefined {
  const svc = (json as { requestError?: { serviceException?: { text?: string; messageId?: string } } })
    ?.requestError?.serviceException;
  return svc?.text;
}
function extractMessageId(json: unknown): string | undefined {
  return (json as { requestError?: { serviceException?: { messageId?: string } } })?.requestError
    ?.serviceException?.messageId;
}
