import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CredentialVault } from '../credentials/CredentialVault.js';

const key = () => randomBytes(32);

describe('CredentialVault', () => {
  it('cifra e decifra de volta ao texto original', () => {
    const vault = new CredentialVault([{ version: 1, key: key() }]);
    const token = 'EAAG_super_secret_token';
    const enc = vault.encrypt(token);
    expect(enc).not.toContain(token);
    expect(vault.decrypt(enc)).toBe(token);
  });

  it('nunca produz o mesmo ciphertext para o mesmo texto (IV aleatório)', () => {
    const vault = new CredentialVault([{ version: 1, key: key() }]);
    expect(vault.encrypt('abc')).not.toBe(vault.encrypt('abc'));
  });

  it('suporta rotação de chave decifrando ciphertext antigo', () => {
    const oldKey = key();
    const newKey = key();
    const oldVault = new CredentialVault([{ version: 1, key: oldKey }]);
    const enc = oldVault.encrypt('tok');

    const rotating = new CredentialVault([
      { version: 1, key: oldKey },
      { version: 2, key: newKey },
    ]);
    // decifra o antigo (v1)
    expect(rotating.decrypt(enc)).toBe('tok');
    // recriptografa para v2
    const rotated = rotating.rotate(enc);
    expect(rotating.keyVersionOf(rotated)).toBe(2);
    expect(rotating.decrypt(rotated)).toBe('tok');
  });

  it('falha ao decifrar com chave indisponível', () => {
    const vault = new CredentialVault([{ version: 1, key: key() }]);
    const enc = vault.encrypt('x');
    const other = new CredentialVault([{ version: 5, key: key() }]);
    expect(() => other.decrypt(enc)).toThrow();
  });

  it('mascara tokens para exibição', () => {
    expect(CredentialVault.mask('EAAG1234567890XYZ')).toBe('EAAG••••0XYZ');
    expect(CredentialVault.mask('short')).toBe('••••');
  });
});
