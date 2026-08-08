/**
 * MetaMockServer (spec §61).
 *
 * Fornece uma implementação de `fetch` que simula a Graph API para
 * desenvolvimento e testes — sem depender de chamadas reais à Meta. Simula
 * respostas 200/400/401/403/429/500, troca de token, listagem de números,
 * detalhes de WABA e assinatura de webhooks.
 *
 * Injete via `MetaProvider({ fetchImpl: server.fetch })`.
 */
export interface MockWaba {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  account_review_status?: string;
  phone_numbers?: MockPhoneNumber[];
}

export interface MockPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
}

export interface MockErrorSpec {
  httpStatus: number;
  code?: number;
  error_subcode?: number;
  message?: string;
  fbtrace_id?: string;
}

export interface MetaMockOptions {
  wabas?: MockWaba[];
  /** Token retornado na troca de code. */
  exchangedToken?: string;
  /** Injeta um erro para o próximo request cujo path contenha a chave. */
  failOn?: Record<string, MockErrorSpec>;
}

export class MetaMockServer {
  private wabas: Map<string, MockWaba>;
  private exchangedToken: string;
  private failOn: Record<string, MockErrorSpec>;
  private messageCounter = 0;
  readonly calls: { method: string; url: string }[] = [];

  constructor(options: MetaMockOptions = {}) {
    this.wabas = new Map((options.wabas ?? []).map((w) => [w.id, w]));
    this.exchangedToken = options.exchangedToken ?? 'MOCK_ACCESS_TOKEN';
    this.failOn = options.failOn ?? {};
  }

  /** `fetch` compatível para injeção no MetaGraphClient. */
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    this.calls.push({ method, url });
    const path = new URL(url).pathname;

    for (const [needle, spec] of Object.entries(this.failOn)) {
      if (url.includes(needle)) return this.errorResponse(spec);
    }

    // Troca de code por token.
    if (path.endsWith('/oauth/access_token')) {
      return this.json(200, { access_token: this.exchangedToken, token_type: 'bearer' });
    }

    // POST /{waba}/subscribed_apps
    if (method === 'POST' && path.endsWith('/subscribed_apps')) {
      return this.json(200, { success: true });
    }

    // POST /{phone-number-id}/messages — envio de mensagem.
    if (method === 'POST' && path.endsWith('/messages')) {
      this.messageCounter += 1;
      return this.json(200, {
        messaging_product: 'whatsapp',
        messages: [{ id: `wamid.MOCK${this.messageCounter}` }],
      });
    }

    // POST /{waba}/message_templates — criação de template.
    if (method === 'POST' && path.endsWith('/message_templates')) {
      const body = parseBody(init?.body);
      const name = (body?.name as string) ?? 'template';
      return this.json(200, { id: `TPL_${name}`, status: 'PENDING', category: body?.category });
    }

    // GET /{waba}/message_templates — listagem.
    if (method === 'GET' && path.endsWith('/message_templates')) {
      return this.json(200, { data: [] });
    }

    // GET /{waba}/phone_numbers
    const phoneMatch = path.match(/\/([^/]+)\/phone_numbers$/);
    if (method === 'GET' && phoneMatch) {
      const waba = this.wabas.get(phoneMatch[1]!);
      if (!waba) return this.errorResponse({ httpStatus: 404, message: 'WABA não encontrada' });
      return this.json(200, { data: waba.phone_numbers ?? [] });
    }

    // GET /{waba} (detalhes)
    const wabaMatch = path.match(/\/v\d+\.\d+\/([^/]+)$/);
    if (method === 'GET' && wabaMatch) {
      const waba = this.wabas.get(wabaMatch[1]!);
      if (waba) {
        return this.json(200, {
          id: waba.id,
          name: waba.name,
          currency: waba.currency,
          timezone_id: waba.timezone_id,
          account_review_status: waba.account_review_status,
        });
      }
    }

    return this.errorResponse({ httpStatus: 404, message: `Sem mock para ${method} ${path}` });
  };

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  private errorResponse(spec: MockErrorSpec): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (spec.httpStatus === 429) headers['retry-after'] = '30';
    return new Response(
      JSON.stringify({
        error: {
          message: spec.message ?? 'mock error',
          code: spec.code,
          error_subcode: spec.error_subcode,
          fbtrace_id: spec.fbtrace_id ?? 'MOCK_TRACE',
        },
      }),
      { status: spec.httpStatus, headers },
    );
  }
}

function parseBody(body: RequestInit['body']): Record<string, unknown> | undefined {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
