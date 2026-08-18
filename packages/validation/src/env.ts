import { z } from 'zod';

/**
 * Validação de variáveis de ambiente com FAIL-FAST no boot (spec §46, §47).
 * Em vez de quebrar em runtime com um erro obscuro (ex.: token indecifrável por
 * ENCRYPTION_KEY ausente), a API/worker recusam subir e listam TUDO que está
 * errado de uma vez, com mensagens acionáveis.
 *
 * As regras espelham o comportamento atual: Meta e Redis são opcionais, mas se
 * uma peça do trio Meta estiver presente, o trio inteiro passa a ser exigido.
 */

/** Base64 de 32 bytes (chave AES-256). Aceita base64 padrão com/sem padding. */
const base64Key32 = z
  .string()
  .refine((v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  }, 'deve ser base64 de 32 bytes (gere com: openssl rand -base64 32)');

const boolish = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const baseEnv = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string({ required_error: 'obrigatória (string de conexão do Postgres)' })
    .min(1, 'obrigatória (string de conexão do Postgres)'),
  REDIS_URL: z.string().min(1).optional(),
  ENCRYPTION_KEY: base64Key32.optional(),
  ENCRYPTION_KEY_PREVIOUS: base64Key32.optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_CONFIG_ID: z.string().min(1).optional(),
  META_GRAPH_BASE_URL: z.string().url().optional(),
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, 'formato esperado vXX.X (ex.: v23.0)')
    .optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_REDIRECT_URI: z.string().url().optional(),
};

/** Exige o trio Meta (app id/secret + chave de cifra) junto, ou nenhum. */
function refineMeta(
  env: {
    META_APP_ID?: string;
    META_APP_SECRET?: string;
    ENCRYPTION_KEY?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const anyMeta = env.META_APP_ID || env.META_APP_SECRET;
  if (!anyMeta) return;
  if (!env.META_APP_ID)
    ctx.addIssue({ code: 'custom', path: ['META_APP_ID'], message: 'obrigatória quando o Meta está configurado' });
  if (!env.META_APP_SECRET)
    ctx.addIssue({ code: 'custom', path: ['META_APP_SECRET'], message: 'obrigatória quando o Meta está configurado' });
  if (!env.ENCRYPTION_KEY)
    ctx.addIssue({
      code: 'custom',
      path: ['ENCRYPTION_KEY'],
      message: 'obrigatória quando o Meta está configurado (cifra o CredentialVault)',
    });
}

export const apiEnvSchema = z
  .object({
    ...baseEnv,
    AUTH_SECRET: z
      .string({ required_error: 'ausente ou muito curto (mín. 16 caracteres)' })
      .min(16, 'ausente ou muito curto (mín. 16 caracteres)'),
    API_PORT: z.coerce.number().int().positive().optional(),
    API_HOST: z.string().min(1).optional(),
    COOKIE_SECURE: boolish,
    // Assistente conversacional (spec §1, §25). Opcional: sem a chave, as rotas
    // /assistant não são registradas.
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).optional(),
    ANTHROPIC_BASE_URL: z.string().url().optional(),
    // Provider Infobip do assistente (spec §1). Quando INFOBIP_BASE_URL +
    // INFOBIP_API_KEY estão presentes, o assistente roda sobre o Infobip.
    INFOBIP_BASE_URL: z.string().url().optional(),
    INFOBIP_API_KEY: z.string().min(1).optional(),
    INFOBIP_SENDERS: z.string().min(1).optional(), // JSON: [{id,number,label}]
    INFOBIP_PRICE_PER_MESSAGE: z.coerce.number().positive().optional(),
    INFOBIP_DEFAULT_COUNTRY: z.string().min(2).max(2).optional(),
    INFOBIP_WEBHOOK_TOKEN: z.string().min(1).optional(),
  })
  .superRefine(refineMeta);

export const workerEnvSchema = z
  .object({
    ...baseEnv,
    REDIS_URL: z
      .string({ required_error: 'obrigatória no worker (fila BullMQ)' })
      .min(1, 'obrigatória no worker (fila BullMQ)'),
  })
  .superRefine(refineMeta);

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Erro agregado e legível — uma linha por variável com problema. */
export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    const lines = issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    super(`Configuração de ambiente inválida:\n${lines.join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Faz o parse ou lança `EnvValidationError` com todos os problemas de uma vez. */
export function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}
