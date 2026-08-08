import { jwtVerify, SignJWT } from 'jose';

/**
 * Sessão baseada em JWT assinado (HS256) — "solução equivalente segura" ao
 * Auth.js para a fronteira de API (spec §2). O token viaja em cookie HttpOnly,
 * Secure e SameSite (spec §47), nunca acessível a JavaScript do frontend.
 *
 * O payload contém apenas o necessário para identificar o usuário; papéis e
 * permissões por organização são resolvidos no backend a cada request contra o
 * banco — nunca confiamos apenas no conteúdo do token para autorização (§10).
 */
export interface SessionPayload {
  sub: string; // userId
  email: string;
  isSuperAdmin: boolean;
}

const ISSUER = 'wise-api-manager';
const AUDIENCE = 'wise-panel';

export interface SessionConfig {
  secret: string;
  /** Duração em segundos (default 7 dias). */
  maxAgeSeconds?: number;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  config: SessionConfig,
): Promise<string> {
  const maxAge = config.maxAgeSeconds ?? 60 * 60 * 24 * 7;
  return new SignJWT({ email: payload.email, isSuperAdmin: payload.isSuperAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(keyFrom(config.secret));
}

export async function verifySessionToken(
  token: string,
  config: SessionConfig,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(config.secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      isSuperAdmin: Boolean(payload.isSuperAdmin),
    };
  } catch {
    return null;
  }
}

/** Nome e atributos padrão do cookie de sessão (spec §47). */
export const SESSION_COOKIE = 'wise_session';

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7, secure = true) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
