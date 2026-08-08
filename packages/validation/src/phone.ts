import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalização de telefone para E.164 (spec §20). Nunca usamos o número textual
 * como identificador interno (spec §15) — mas normalizamos para deduplicar e
 * para enviar no formato aceito pela Meta.
 *
 * @param raw     número em qualquer formato
 * @param country país padrão quando o número não vier em formato internacional
 * @returns E.164 (ex.: +5511990000000) ou null se inválido
 */
export function normalizePhone(raw: string, country: CountryCode = 'BR'): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number; // E.164
  } catch {
    return null;
  }
}

export type { CountryCode };
