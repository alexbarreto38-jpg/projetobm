/**
 * Identificador humano e único de campanha (spec §23). O ID viaja em todos os
 * logs e mensagens ao usuário e serve de âncora de idempotência: uma chamada
 * repetida acidentalmente refere-se à MESMA campanha, não a uma nova.
 *
 * Formato: `CAMP-<ano>-<sequência 6 dígitos>` (ex.: `CAMP-2026-000123`).
 */
export function formatCampaignId(year: number, sequence: number): string {
  return `CAMP-${year}-${String(sequence).padStart(6, '0')}`;
}

const CAMPAIGN_ID_RE = /^CAMP-(\d{4})-(\d{6})$/;

export function isCampaignId(value: string): boolean {
  return CAMPAIGN_ID_RE.test(value);
}
