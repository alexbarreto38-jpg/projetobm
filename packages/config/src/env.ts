import { z } from 'zod';

/**
 * Validação centralizada de variáveis de ambiente (spec §5, §45).
 *
 * A versão e a base da Graph API vivem AQUI — nunca espalhamos
 * `graph.facebook.com/vXX.X` pelo código. Para atualizar a Graph API,
 * altera-se apenas META_GRAPH_VERSION.
 *
 * Segredos (META_APP_SECRET, ENCRYPTION_KEY) são consumidos apenas no
 * backend/worker. O bundle do frontend nunca deve importar este módulo.
 */
const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),

  // CredentialVault (AES-256-GCM). Chave de 32 bytes em base64.
  ENCRYPTION_KEY: z.string().min(32),
  ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),

  // Meta / Graph API — versionamento centralizado.
  META_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com'),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'formato esperado: vXX.X'),

  // Meta App
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_CONFIG_ID: z.string().optional(),

  // Webhooks
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // Feature flags (evolução 2026). Capability detection tem precedência.
  META_NEW_ACCOUNT_MODEL: booleanFromString.default('false'),
  META_NEW_MESSAGING_ACCOUNT: booleanFromString.default('false'),

  // Observabilidade
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Faz o parse e valida `process.env` (ou uma fonte fornecida). Lança um erro
 * legível quando alguma variável obrigatória estiver ausente/ inválida —
 * falhamos cedo, em vez de descobrir em runtime dentro de um worker.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Proxy preguiçoso: só valida quando a primeira variável é acessada. Assim,
 * importar `env` em um módulo compartilhado não força a validação em contextos
 * (ex.: testes unitários puros) que não precisam do ambiente completo.
 */
let cached: Env | undefined;
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    cached ??= loadEnv();
    return cached[prop as keyof Env];
  },
});
