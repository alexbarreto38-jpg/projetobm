import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { apiEnvSchema, EnvValidationError, parseEnv, workerEnvSchema } from '../env.js';

const key32 = randomBytes(32).toString('base64');

function base(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    AUTH_SECRET: 'a'.repeat(16),
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('apiEnvSchema', () => {
  it('aceita ambiente mínimo (sem Meta/Redis)', () => {
    const env = parseEnv(apiEnvSchema, base());
    expect(env.AUTH_SECRET).toHaveLength(16);
    expect(env.META_APP_ID).toBeUndefined();
  });

  it('rejeita AUTH_SECRET curto e DATABASE_URL ausente de uma vez', () => {
    let err: EnvValidationError | undefined;
    try {
      parseEnv(apiEnvSchema, { NODE_ENV: 'production', AUTH_SECRET: 'short' } as NodeJS.ProcessEnv);
    } catch (e) {
      err = e as EnvValidationError;
    }
    expect(err).toBeInstanceOf(EnvValidationError);
    const paths = err!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('AUTH_SECRET');
    expect(paths).toContain('DATABASE_URL');
  });

  it('exige o trio Meta quando qualquer peça está presente', () => {
    let err: EnvValidationError | undefined;
    try {
      parseEnv(apiEnvSchema, base({ META_APP_ID: '123' }));
    } catch (e) {
      err = e as EnvValidationError;
    }
    const paths = err!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('META_APP_SECRET');
    expect(paths).toContain('ENCRYPTION_KEY');
  });

  it('aceita o trio Meta completo com chave base64 de 32 bytes', () => {
    const env = parseEnv(
      apiEnvSchema,
      base({ META_APP_ID: '123', META_APP_SECRET: 'secret', ENCRYPTION_KEY: key32 }),
    );
    expect(env.ENCRYPTION_KEY).toBe(key32);
  });

  it('rejeita ENCRYPTION_KEY que não seja 32 bytes', () => {
    expect(() =>
      parseEnv(apiEnvSchema, base({ ENCRYPTION_KEY: Buffer.from('curta').toString('base64') })),
    ).toThrow(EnvValidationError);
  });

  it('coage COOKIE_SECURE e API_PORT', () => {
    const env = parseEnv(apiEnvSchema, base({ COOKIE_SECURE: 'false', API_PORT: '3001' }));
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.API_PORT).toBe(3001);
  });

  it('valida o formato de META_GRAPH_VERSION', () => {
    expect(() => parseEnv(apiEnvSchema, base({ META_GRAPH_VERSION: '23' }))).toThrow(
      EnvValidationError,
    );
    expect(parseEnv(apiEnvSchema, base({ META_GRAPH_VERSION: 'v23.0' })).META_GRAPH_VERSION).toBe(
      'v23.0',
    );
  });
});

describe('workerEnvSchema', () => {
  it('exige REDIS_URL', () => {
    let err: EnvValidationError | undefined;
    try {
      parseEnv(workerEnvSchema, base());
    } catch (e) {
      err = e as EnvValidationError;
    }
    expect(err!.issues.map((i) => i.path.join('.'))).toContain('REDIS_URL');
  });

  it('aceita com REDIS_URL', () => {
    const env = parseEnv(workerEnvSchema, base({ REDIS_URL: 'redis://localhost:6379' }));
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
  });
});
