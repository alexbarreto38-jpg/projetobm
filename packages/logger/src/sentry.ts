import { logger } from './index.js';

/**
 * Integração opcional com Sentry (spec §43). Ativa apenas quando SENTRY_DSN
 * está presente. NUNCA enviamos tokens/segredos: `beforeSend` remove campos
 * sensíveis recursivamente antes do envio.
 *
 * O @sentry/node é importado dinamicamente para não pesar quando desativado.
 */
const SENSITIVE = /(token|secret|authorization|password|encrypted|api[-_]?key)/i;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

let enabled = false;

export async function initSentry(context: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0,
      beforeSend: (event) => scrub(event) as never,
    });
    Sentry.setTag('service', context);
    enabled = true;
    logger.info({ context }, 'Sentry habilitado');
  } catch (err) {
    logger.warn({ err }, 'Não foi possível iniciar o Sentry');
  }
}

export async function captureException(error: unknown, extra?: Record<string, unknown>): Promise<void> {
  if (!enabled) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(error, extra ? { extra: scrub(extra) as Record<string, unknown> } : undefined);
  } catch {
    // silencioso: observabilidade nunca deve derrubar o processo
  }
}
