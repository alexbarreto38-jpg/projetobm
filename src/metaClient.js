// Wrapper sobre a Graph API da Meta (WhatsApp Cloud API).
// Usa fetch nativo (Node >= 18). Cada BM/WABA tem seu próprio token.

import { logger } from './logger.js';
import { sleep } from './batch.js';

const DEFAULT_VERSION = process.env.META_API_VERSION || 'v21.0';
// Base da Graph API. Lida no momento da construção (env sobrescreve; útil
// para testes/mock ou proxy).
function defaultBase() {
  return process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
}

export class MetaApiError extends Error {
  constructor(message, { status, code, subcode, fbtraceId, body } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
    this.body = body;
  }
}

// Erros que valem a pena tentar de novo (rate limit / transitórios).
function isRetryable(status, code) {
  if (status === 429) return true;
  if (status >= 500) return true;
  // 4 = rate limit da app, 80007 = rate limit do WABA, 131048/131056 = limites de spam/pares
  if ([4, 80007, 131048, 131056].includes(code)) return true;
  return false;
}

export class MetaClient {
  constructor({ token, version = DEFAULT_VERSION, base, maxRetries = 4, baseDelayMs = 1000 } = {}) {
    if (!token) throw new Error('MetaClient requer um token de acesso');
    this.token = token;
    this.version = version;
    this.base = base || defaultBase();
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(`${this.base}/${this.version}/${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }

    const headers = {
      Authorization: `Bearer ${this.token}`,
    };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let attempt = 0;
    while (true) {
      attempt++;
      let res;
      try {
        res = await fetch(url, { method, headers, body: payload });
      } catch (netErr) {
        // erro de rede: tenta de novo
        if (attempt <= this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** (attempt - 1);
          logger.warn(`Erro de rede (${netErr.message}). Retry em ${delay}ms (${attempt}/${this.maxRetries})`);
          await sleep(delay);
          continue;
        }
        throw new MetaApiError(`Falha de rede: ${netErr.message}`, {});
      }

      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (res.ok) return json;

      const err = json.error || {};
      const code = err.code;
      const status = res.status;

      if (isRetryable(status, code) && attempt <= this.maxRetries) {
        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        logger.warn(
          `HTTP ${status} code=${code} "${err.message || ''}". Retry em ${delay}ms (${attempt}/${this.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      throw new MetaApiError(err.message || `HTTP ${status}`, {
        status,
        code,
        subcode: err.error_subcode,
        fbtraceId: err.fbtrace_id,
        body: json,
      });
    }
  }

  // ---- Templates ----

  // Cria um template de mensagem em um WABA.
  // https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
  createTemplate(wabaId, template) {
    return this.request('POST', `${wabaId}/message_templates`, { body: template });
  }

  // Lista templates de um WABA (útil para checar aprovação).
  listTemplates(wabaId, { limit = 100, after } = {}) {
    return this.request('GET', `${wabaId}/message_templates`, {
      query: { limit, after },
    });
  }

  // ---- Envio de mensagens ----

  // Envia uma mensagem de template a partir de um phone number ID.
  // https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
  sendTemplateMessage(phoneNumberId, { to, templateName, languageCode, components }) {
    const message = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };
    if (components && components.length) {
      message.template.components = components;
    }
    return this.request('POST', `${phoneNumberId}/messages`, { body: message });
  }
}
