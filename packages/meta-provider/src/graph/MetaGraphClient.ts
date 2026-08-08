import { metaErrorFromResponse, MetaApiError } from '../errors/MetaApiError.js';

/**
 * MetaGraphClient — ÚNICO ponto por onde passam as requisições à Graph API
 * (spec §5, §68). Nenhum outro módulo deve construir URLs
 * `graph.facebook.com/vXX.X`. Para trocar a versão da Graph API, altera-se
 * apenas a configuração injetada aqui.
 */
export interface MetaGraphClientConfig {
  baseUrl: string; // ex.: https://graph.facebook.com
  version: string; // ex.: v23.0
  appSecret?: string; // usado para appsecret_proof, quando aplicável
  /** Timeout por requisição (ms). */
  timeoutMs?: number;
  /** Injetável para testes (MetaMockServer — spec §61). */
  fetchImpl?: typeof fetch;
}

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Query string (para GET). */
  query?: Record<string, string | number | boolean | undefined>;
  /** Corpo JSON (para POST). */
  body?: unknown;
  /**
   * Access token da conta/conexão. Nunca logado. Opcional para chamadas que
   * não usam bearer (ex.: troca de code por token via /oauth/access_token, que
   * autentica por client_id/client_secret na query).
   */
  accessToken?: string;
  /** Correlação para observabilidade. */
  requestId?: string;
  signal?: AbortSignal;
}

export class MetaGraphClient {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaGraphClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.version = config.version;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** Monta a URL versionada centralmente. `path` NÃO deve conter a versão. */
  private buildUrl(path: string, query?: GraphRequestOptions['query']): string {
    const cleanPath = path.replace(/^\//, '');
    const url = new URL(`${this.baseUrl}/${this.version}/${cleanPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T = unknown>(path: string, options: GraphRequestOptions): Promise<T> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(path, options.query);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const headers: Record<string, string> = {};
      if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
      }
      let payload: string | undefined;
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(options.body);
      }

      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });

      const text = await response.text();
      const json: unknown = text ? safeParse(text) : undefined;

      if (!response.ok) {
        throw metaErrorFromResponse(response.status, json, response.headers);
      }
      return json as T;
    } catch (err) {
      if (err instanceof MetaApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MetaApiError({
          category: 'TRANSIENT',
          retryable: true,
          message: 'Timeout ao comunicar com a Meta.',
          requestId: options.requestId,
        });
      }
      throw new MetaApiError({
        category: 'TRANSIENT',
        retryable: true,
        message: err instanceof Error ? err.message : 'Erro de rede desconhecido.',
        requestId: options.requestId,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  get<T = unknown>(path: string, options: GraphRequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = unknown>(path: string, options: GraphRequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST' });
  }

  delete<T = unknown>(path: string, options: GraphRequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
