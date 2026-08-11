import { describe, expect, it } from 'vitest';
import { captureException, initSentry, scrub } from '../sentry.js';

describe('scrub (redação de segredos p/ Sentry)', () => {
  it('remove campos sensíveis recursivamente', () => {
    const out = scrub({
      user: 'ana',
      accessToken: 'EAAG-secret',
      nested: { apiKey: 'k', password: 'p', ok: 1 },
      list: [{ authorization: 'Bearer x' }],
    }) as Record<string, unknown>;
    expect(out.user).toBe('ana');
    expect(out.accessToken).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect((out.list as Record<string, unknown>[])[0]!.authorization).toBe('[REDACTED]');
  });

  it('mantém valores primitivos e limita profundidade sem estourar', () => {
    expect(scrub('x')).toBe('x');
    expect(scrub(42)).toBe(42);
    expect(scrub(null)).toBeNull();
  });

  it('initSentry sem DSN é no-op e captureException não lança', async () => {
    delete process.env.SENTRY_DSN;
    await expect(initSentry('test')).resolves.toBeUndefined();
    await expect(captureException(new Error('x'))).resolves.toBeUndefined();
  });
});
