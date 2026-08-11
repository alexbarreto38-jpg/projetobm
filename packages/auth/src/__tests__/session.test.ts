import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '../session.js';

const config = { secret: 'a-very-long-test-secret-key-1234567890' };

describe('session token', () => {
  it('cria e verifica um token válido', async () => {
    const token = await createSessionToken(
      { sub: 'user_1', email: 'a@b.com', isSuperAdmin: false },
      config,
    );
    const payload = await verifySessionToken(token, config);
    expect(payload?.sub).toBe('user_1');
    expect(payload?.email).toBe('a@b.com');
    expect(payload?.isSuperAdmin).toBe(false);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken(
      { sub: 'user_1', email: 'a@b.com', isSuperAdmin: true },
      config,
    );
    expect(await verifySessionToken(token, { secret: 'different-secret-abcdefghij' })).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken(
      { sub: 'user_1', email: 'a@b.com', isSuperAdmin: false },
      { ...config, maxAgeSeconds: -1 },
    );
    expect(await verifySessionToken(token, config)).toBeNull();
  });

  it('rejeita lixo', async () => {
    expect(await verifySessionToken('garbage.token.here', config)).toBeNull();
  });
});
