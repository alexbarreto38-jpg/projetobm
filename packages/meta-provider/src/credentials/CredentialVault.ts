import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * CredentialVault (spec §8).
 *
 * Tokens NUNCA são armazenados em texto puro nem enviados ao frontend.
 * Usamos AES-256-GCM (autenticado). O formato do ciphertext é:
 *
 *   v<keyVersion>:<iv_base64>:<authTag_base64>:<data_base64>
 *
 * Suporta rotação de chave: a chave atual (keyVersion mais alto) é usada para
 * cifrar; chaves anteriores continuam disponíveis para decifrar credenciais
 * antigas até que sejam recriptografadas.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM

export interface VaultKey {
  version: number;
  /** Chave de 32 bytes. */
  key: Buffer;
}

export class CredentialVault {
  private readonly keys: Map<number, Buffer>;
  private readonly currentVersion: number;

  /**
   * @param keys chaves disponíveis. A de maior `version` é a chave de cifragem.
   */
  constructor(keys: VaultKey[]) {
    if (keys.length === 0) {
      throw new Error('CredentialVault requer ao menos uma chave.');
    }
    this.keys = new Map();
    for (const { version, key } of keys) {
      if (key.length !== 32) {
        throw new Error(`Chave de criptografia v${version} deve ter 32 bytes.`);
      }
      this.keys.set(version, key);
    }
    this.currentVersion = Math.max(...keys.map((k) => k.version));
  }

  /**
   * Cria um vault a partir das variáveis de ambiente (base64).
   * ENCRYPTION_KEY é a chave atual; ENCRYPTION_KEY_PREVIOUS é opcional.
   */
  static fromEnv(current: string, previous?: string): CredentialVault {
    const keys: VaultKey[] = [{ version: 2, key: decodeKey(current) }];
    if (previous) keys.push({ version: 1, key: decodeKey(previous) });
    // Quando não há chave anterior, a atual é v1.
    if (!previous) return new CredentialVault([{ version: 1, key: decodeKey(current) }]);
    return new CredentialVault(keys);
  }

  encrypt(plaintext: string): string {
    const key = this.keys.get(this.currentVersion)!;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
      `v${this.currentVersion}`,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) {
      throw new Error('Ciphertext em formato inválido.');
    }
    const [versionTag, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
    const version = Number(versionTag.replace(/^v/, ''));
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Chave v${version} indisponível para decifrar a credencial.`);
    }
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /** Versão da chave usada em um ciphertext — útil para saber o que recriptografar. */
  keyVersionOf(ciphertext: string): number {
    return Number(ciphertext.split(':')[0]?.replace(/^v/, '') ?? '0');
  }

  /** Recriptografa com a chave atual (rotação). */
  rotate(ciphertext: string): string {
    return this.encrypt(this.decrypt(ciphertext));
  }

  /** Mascara um token para exibição — nunca mostrar completo (spec §8). */
  static mask(token: string): string {
    if (token.length <= 8) return '••••';
    return `${token.slice(0, 4)}••••${token.slice(-4)}`;
  }
}

function decodeKey(b64: string): Buffer {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY deve decodificar para 32 bytes (base64 de 32 bytes).');
  }
  return buf;
}
