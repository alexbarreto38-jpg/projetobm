/**
 * Serialização CSV segura para export operacional (spec §32/§40). Escapa aspas,
 * vírgulas e quebras de linha (RFC 4180), usa CRLF e prefixa BOM UTF-8 para o
 * Excel abrir acentuação corretamente. Não injeta fórmulas: valores que começam
 * com =, +, -, @ são prefixados com aspa simples (defesa contra CSV injection).
 */
export type CsvCell = string | number | boolean | null | undefined;

/** BOM UTF-8 (via code point para não deixar caractere invisível no fonte). */
export const CSV_BOM = String.fromCharCode(0xfeff);

function escapeCell(value: CsvCell): string {
  if (value == null) return '';
  let s = String(value);
  // Neutraliza fórmulas (CSV/formula injection) em planilhas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return `${CSV_BOM}${lines.join('\r\n')}`;
}
