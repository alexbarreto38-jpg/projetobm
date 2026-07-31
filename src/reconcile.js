// Reconcilia os envios do disparo (sends CSV) com os status recebidos
// pelo webhook (status CSV), juntando por messageId.
//
// Produz, por envio, o status final observado (delivered/read/failed/...)
// e um resumo agregado. Útil para fechar a régua de entrega.

import fs from 'node:fs';
import { parseCSV } from './csv.js';
import { logger } from './logger.js';

// Ordem de "avanço" de status: um status mais adiantado prevalece.
const RANK = { sent: 1, delivered: 2, read: 3 };

// Escolhe o status final entre os eventos de webhook de um mesmo messageId.
// 'failed' é terminal e sempre prevalece; senão, o de maior rank.
function finalStatus(events) {
  if (events.some((e) => e.status === 'failed')) return 'failed';
  let best = null;
  for (const e of events) {
    if (RANK[e.status] === undefined) continue;
    if (!best || RANK[e.status] > RANK[best.status]) best = e;
  }
  return best ? best.status : '';
}

// `sendsRows`: linhas do CSV de envios (bm, phoneId, to, messageId, sendStatus, error)
// `statusRows`: linhas do CSV do webhook (phoneId, messageId, recipient, status, ...)
export function reconcile(sendsRows, statusRows) {
  // agrupa eventos de status por messageId
  const byMsg = new Map();
  for (const s of statusRows) {
    if (!s.messageId) continue;
    if (!byMsg.has(s.messageId)) byMsg.set(s.messageId, []);
    byMsg.get(s.messageId).push(s);
  }

  const rows = sendsRows.map((snd) => {
    const events = snd.messageId ? byMsg.get(snd.messageId) || [] : [];
    let final;
    let errorCode = '';
    let errorTitle = '';

    if (snd.sendStatus === 'failed') {
      final = 'send_failed'; // falhou já no envio (nem chegou à Meta)
    } else if (snd.sendStatus === 'skipped') {
      final = 'skipped';
    } else if (events.length === 0) {
      final = 'no_status'; // enviado, mas sem retorno do webhook (ainda?)
    } else {
      final = finalStatus(events);
      const failedEvt = events.find((e) => e.status === 'failed');
      if (failedEvt) {
        errorCode = failedEvt.errorCode || '';
        errorTitle = failedEvt.errorTitle || '';
      }
    }

    return {
      bm: snd.bm || '',
      to: snd.to || '',
      messageId: snd.messageId || '',
      finalStatus: final,
      errorCode,
      errorTitle,
      sendError: snd.error || '',
    };
  });

  // resumo por status final
  const summary = {};
  for (const r of rows) summary[r.finalStatus] = (summary[r.finalStatus] || 0) + 1;

  return { rows, summary };
}

// Versão de conveniência que lê os dois CSVs do disco.
export function reconcileFiles(sendsPath, statusPath) {
  const sendsRows = parseCSV(fs.readFileSync(sendsPath, 'utf8'));
  const statusRows = parseCSV(fs.readFileSync(statusPath, 'utf8'));
  const result = reconcile(sendsRows, statusRows);
  const summaryTxt = Object.entries(result.summary)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  logger.info(`Reconciliação: ${result.rows.length} envio(s) [${summaryTxt}]`);
  return result;
}
