/**
 * Erro padronizado da camada Meta (spec §48, §49).
 *
 * Preservamos SEMPRE os campos oficiais enviados pela API — code, error_subcode,
 * message, fbtrace_id — para facilitar o suporte. Nunca inventamos códigos de
 * erro. A `category` é uma classificação NOSSA, derivada, que não substitui os
 * campos originais.
 */
export type MetaErrorCategory =
  | 'AUTH' // token inválido/expirado, permissão insuficiente
  | 'RATE_LIMIT' // throttling oficial (ex.: 429, códigos de rate)
  | 'VALIDATION' // parâmetros inválidos, template malformado
  | 'PERMISSION' // conta sem a permissão necessária
  | 'ACCOUNT_STATE' // conta bloqueada/suspensa/restrita
  | 'TRANSIENT' // 5xx, timeout, indisponibilidade
  | 'UNKNOWN';

export interface MetaApiErrorInit {
  category: MetaErrorCategory;
  httpStatus?: number;
  metaErrorCode?: number | string;
  metaErrorSubcode?: number | string;
  fbtraceId?: string;
  retryable: boolean;
  retryAfterMs?: number;
  requestId?: string;
  message: string;
  /** Payload de erro original da Meta, preservado sem alteração. */
  raw?: unknown;
}

export class MetaApiError extends Error {
  readonly category: MetaErrorCategory;
  readonly httpStatus?: number;
  readonly metaErrorCode?: number | string;
  readonly metaErrorSubcode?: number | string;
  readonly fbtraceId?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly raw?: unknown;

  constructor(init: MetaApiErrorInit) {
    super(init.message);
    this.name = 'MetaApiError';
    this.category = init.category;
    this.httpStatus = init.httpStatus;
    this.metaErrorCode = init.metaErrorCode;
    this.metaErrorSubcode = init.metaErrorSubcode;
    this.fbtraceId = init.fbtraceId;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.requestId = init.requestId;
    this.raw = init.raw;
  }

  /**
   * Mensagem amigável para o usuário final (spec §48). Nunca expõe stack trace
   * nem token. O código oficial é anexado quando disponível para suporte.
   */
  toUserMessage(context?: string): string {
    const suffix = this.metaErrorCode ? ` (código Meta ${this.metaErrorCode})` : '';
    const where = context ? `${context}: ` : '';
    switch (this.category) {
      case 'PERMISSION':
        return `${where}a conta não possui a permissão necessária para esta operação${suffix}.`;
      case 'AUTH':
        return `${where}a autorização com a Meta expirou ou é inválida. Reconecte a conta${suffix}.`;
      case 'RATE_LIMIT':
        return `${where}limite temporário da plataforma atingido. Tente novamente em instantes${suffix}.`;
      case 'ACCOUNT_STATE':
        return `${where}envio interrompido devido a restrição da plataforma${suffix}.`;
      case 'VALIDATION':
        return `${where}os dados enviados foram rejeitados pela Meta${suffix}.`;
      case 'TRANSIENT':
        return `${where}indisponibilidade temporária da Meta. A operação será retentada${suffix}.`;
      default:
        return `${where}ocorreu um erro ao comunicar com a Meta${suffix}.`;
    }
  }

  /** Representação segura para logs (sem token, sem stack sensível). */
  toLogObject(): Record<string, unknown> {
    return {
      category: this.category,
      httpStatus: this.httpStatus,
      metaErrorCode: this.metaErrorCode,
      metaErrorSubcode: this.metaErrorSubcode,
      fbtraceId: this.fbtraceId,
      retryable: this.retryable,
      requestId: this.requestId,
      message: this.message,
    };
  }
}

/**
 * Constrói um MetaApiError a partir de uma resposta HTTP + corpo de erro da
 * Graph API. Mapeia o formato oficial `{ error: { message, code,
 * error_subcode, fbtrace_id, ... } }` para nossa estrutura sem descartar dados.
 */
export function metaErrorFromResponse(
  httpStatus: number,
  body: unknown,
  headers?: Headers,
): MetaApiError {
  const error = (body as { error?: Record<string, unknown> } | undefined)?.error;
  const code = error?.code as number | undefined;
  const subcode = error?.error_subcode as number | undefined;
  const message = (error?.message as string | undefined) ?? `HTTP ${httpStatus}`;
  const fbtraceId = error?.fbtrace_id as string | undefined;

  const retryAfterHeader = headers?.get('retry-after');
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;

  const category = classify(httpStatus, code, subcode);
  const retryable = category === 'TRANSIENT' || category === 'RATE_LIMIT';

  return new MetaApiError({
    category,
    httpStatus,
    metaErrorCode: code,
    metaErrorSubcode: subcode,
    fbtraceId,
    retryable,
    retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    message,
    raw: body,
  });
}

/**
 * Classificação heurística. Os códigos concretos da Meta devem ser confirmados
 * na documentação oficial de error codes antes de ampliar este mapeamento:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 */
function classify(
  httpStatus: number,
  code?: number,
  _subcode?: number,
): MetaErrorCategory {
  if (httpStatus === 429) return 'RATE_LIMIT';
  if (httpStatus >= 500) return 'TRANSIENT';
  if (httpStatus === 401) return 'AUTH';
  if (httpStatus === 403) return 'PERMISSION';
  // Faixas conhecidas de rate limit da Graph API (confirmar na doc oficial).
  if (code === 4 || code === 80007 || code === 130429 || code === 131048) return 'RATE_LIMIT';
  if (code === 190) return 'AUTH'; // token expirado/inválido
  if (code === 10 || code === 200 || code === 299) return 'PERMISSION';
  if (httpStatus >= 400 && httpStatus < 500) return 'VALIDATION';
  return 'UNKNOWN';
}
