import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('password hashing', () => {
  it('verifica a senha correta', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejeita a senha errada', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('não expõe a senha em texto no hash', async () => {
    const hash = await hashPassword('supersecret123');
    expect(hash).not.toContain('supersecret123');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('rejeita formato de hash inválido', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false);
  });
});
