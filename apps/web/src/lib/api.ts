import { cookies } from 'next/headers';

/**
 * Cliente da API (server-side apenas — spec §8, §46). O token/segredo nunca vai
 * ao navegador: as chamadas partem do servidor Next, encaminhando o cookie de
 * sessão HttpOnly. As páginas usam este cliente em Server Components.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'wise_session';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

function sessionHeader(): Record<string, string> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? { cookie: `${SESSION_COOKIE}=${token}` } : {};
}

/**
 * Faz uma requisição autenticada à API. Nunca lança em erro de rede/HTTP —
 * retorna um resultado tipado para a página tratar loading/empty/error.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...sessionHeader(),
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const error =
        (body as { error?: { message?: string } } | undefined)?.error?.message ??
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch {
    return { ok: false, status: 0, error: 'API indisponível' };
  }
}

/**
 * Busca crua (sem parse JSON), encaminhando o cookie de sessão. Usada para
 * baixar CSV/arquivos via BFF — o token permanece no servidor (spec §8, §46).
 */
export async function apiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...sessionHeader(), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
}

export { API_URL, SESSION_COOKIE };
