// Monta um plano de reenvio a partir do relatório final da reconciliação:
// seleciona os envios com status "reprocessável" e agrupa por BM, para
// redisparar só para quem falhou.

import fs from 'node:fs';
import { parseCSV } from './csv.js';

// Status que, por padrão, valem reenvio.
export const DEFAULT_RETRY_STATUSES = ['failed', 'send_failed'];

// finalRows: linhas do final.csv (bm, to, messageId, finalStatus, ...)
// opts.statuses: quais finalStatus reprocessar
// opts.recipientsByPhone: Map phone -> { vars } para recuperar as variáveis
//   originais do template (opcional; sem ele, reenvia sem variáveis)
//
// Retorna { byBM: Map<bmName, recipients[]>, count, byStatus }.
export function planRetry(finalRows, { statuses = DEFAULT_RETRY_STATUSES, recipientsByPhone } = {}) {
  const set = new Set(statuses);
  const byBM = new Map();
  const byStatus = {};
  let count = 0;

  for (const row of finalRows) {
    const status = row.finalStatus;
    if (!set.has(status)) continue;
    const phone = row.to;
    if (!phone) continue;

    byStatus[status] = (byStatus[status] || 0) + 1;
    const bm = row.bm || '';
    const vars = recipientsByPhone?.get(phone)?.vars || {};
    if (!byBM.has(bm)) byBM.set(bm, []);
    byBM.get(bm).push({ phone, vars });
    count++;
  }

  return { byBM, count, byStatus };
}

// Conveniência: lê o final.csv do disco.
export function loadFinalReport(finalPath) {
  return parseCSV(fs.readFileSync(finalPath, 'utf8'));
}
