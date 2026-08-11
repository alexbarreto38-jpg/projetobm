import { randomBytes, scrypt as scryptCb, type ScryptOptions, timingSafeEqual } from 'node:crypto';

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hashing de senha com scrypt (spec §47, §78 — segurança em primeiro lugar).
 *
 * scrypt é nativo do Node (sem dependência nativa a compilar) e resistente a
 * hardware. Formato armazenado:  scrypt$N$r$p$salt_b64$hash_b64
 */
const N = 16384; // custo de CPU/memória
const r = 8;
const p = 1;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, KEYLEN, { N, r, p })) as Buffer;
  return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = (await scrypt(plain, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  })) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
