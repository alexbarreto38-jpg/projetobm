import pino, { type Logger } from 'pino';

/**
 * Logger estruturado (spec §42, §43).
 *
 * NUNCA registramos token, segredo ou dados sensíveis completos. A lista de
 * `redact` abaixo mascara campos comuns por caminho. Ao logar objetos de erro
 * da Meta, prefira os campos seguros (code, subcode, fbtrace_id) — nunca o
 * token usado na requisição.
 *
 * Campos recomendados por log (spec §42): request_id, organization_id, job_id,
 * campaign_id, phone_number_id interno, endpoint lógico, status, latency, error.
 */
const REDACT_PATHS = [
  'token',
  '*.token',
  'access_token',
  '*.access_token',
  'accessToken',
  '*.accessToken',
  'encryptedToken',
  '*.encryptedToken',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'appSecret',
  '*.appSecret',
  'META_APP_SECRET',
  'ENCRYPTION_KEY',
  'AUTH_SECRET',
];

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  base: { service: process.env.SERVICE_NAME ?? 'wise' },
});

/**
 * Cria um logger filho com contexto fixo (ex.: por request ou por job).
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
export { initSentry, captureException } from './sentry.js';
