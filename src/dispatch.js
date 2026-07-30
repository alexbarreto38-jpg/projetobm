// Dispara mensagens de template a partir das BMs, processando as BMs
// em lotes (por padrão 250 "juntas") e, dentro de cada BM, enviando
// para a lista de destinatários.

import { logger } from './logger.js';
import { MetaClient, MetaApiError } from './metaClient.js';
import { chunk, mapWithConcurrency, sleep } from './batch.js';

// Constrói os `components` da mensagem a partir das variáveis do destinatário.
// Convenção: colunas body1, body2, ... viram parâmetros de texto do BODY,
// na ordem. Se não houver nenhuma, retorna undefined (template sem variáveis).
export function buildComponents(vars = {}) {
  const params = [];
  let i = 1;
  while (vars[`body${i}`] !== undefined && vars[`body${i}`] !== '') {
    params.push({ type: 'text', text: String(vars[`body${i}`]) });
    i++;
  }
  if (params.length === 0) return undefined;
  return [{ type: 'body', parameters: params }];
}

// Envia o template de uma BM para todos os seus destinatários.
async function dispatchFromBM(bm, recipients, opts) {
  const { templateName, languageCode, version, recipientConcurrency, api } = opts;
  if (!bm.phoneId) {
    throw new MetaApiError('BM sem phone_id (necessário para envio)', {});
  }
  const client = new MetaClient({ token: bm.token, version });

  const settled = await mapWithConcurrency(recipients, recipientConcurrency, async (rcpt) => {
    const components = buildComponents(rcpt.vars);
    const resp = await client.sendTemplateMessage(bm.phoneId, {
      to: rcpt.phone,
      templateName,
      languageCode,
      components,
      api,
    });
    const id = resp?.messages?.[0]?.id;
    return { to: rcpt.phone, messageId: id };
  });

  let sent = 0;
  let failed = 0;
  const failures = [];
  settled.forEach((s, idx) => {
    if (s.status === 'fulfilled') {
      sent++;
    } else {
      failed++;
      const err = s.reason;
      const msg = err instanceof MetaApiError ? `${err.message} (code=${err.code})` : err.message;
      failures.push({ to: recipients[idx].phone, error: msg });
    }
  });

  return { bm: bm.name, phoneId: bm.phoneId, sent, failed, total: recipients.length, failures };
}

// Resolve quais destinatários vão para cada BM.
// - Se `recipientsByBM` (Map name->recipients[]) for dado, usa ele.
// - Senão, usa a mesma lista `recipients` para todas as BMs.
function recipientsFor(bm, { recipients, recipientsByBM }) {
  if (recipientsByBM && recipientsByBM.has(bm.name)) {
    return recipientsByBM.get(bm.name);
  }
  return recipients || [];
}

// Dispara em lotes de `batchSize` BMs por vez.
export async function dispatchInBatches(bms, opts) {
  const {
    batchSize = 250,
    bmConcurrency = 25,
    recipientConcurrency = 10,
    templateName,
    languageCode = 'pt_BR',
    version,
    recipients,
    recipientsByBM,
    delayBetweenBatchesMs = 0,
    api = 'cloud',
  } = opts;

  if (!templateName) throw new Error('dispatchInBatches requer templateName');

  const batches = chunk(bms, batchSize);
  logger.info(
    `Disparo (${api}): ${bms.length} BM(s) em ${batches.length} lote(s) de até ${batchSize}, ` +
      `template="${templateName}" lang=${languageCode}`
  );

  const allResults = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    logger.info(`--- Lote ${b + 1}/${batches.length} (${batch.length} BMs) ---`);

    const settled = await mapWithConcurrency(batch, bmConcurrency, async (bm) => {
      const rcpts = recipientsFor(bm, { recipients, recipientsByBM });
      if (rcpts.length === 0) {
        return { bm: bm.name, phoneId: bm.phoneId, sent: 0, failed: 0, total: 0, failures: [] };
      }
      return dispatchFromBM(bm, rcpts, { templateName, languageCode, version, recipientConcurrency, api });
    });

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        const r = s.value;
        logger.info(`  ${r.bm}: enviados=${r.sent} falhas=${r.failed}/${r.total}`);
        allResults.push({ ...r, ok: r.failed === 0 });
      } else {
        const bm = batch[i];
        const err = s.reason;
        const msg = err instanceof MetaApiError ? `${err.message} (code=${err.code})` : err.message;
        logger.error(`  ${bm.name}: ERRO no lote — ${msg}`);
        allResults.push({
          bm: bm.name,
          phoneId: bm.phoneId,
          sent: 0,
          failed: 0,
          total: 0,
          failures: [],
          ok: false,
          error: msg,
        });
      }
    });

    if (delayBetweenBatchesMs > 0 && b < batches.length - 1) {
      logger.info(`Aguardando ${delayBetweenBatchesMs}ms antes do próximo lote...`);
      await sleep(delayBetweenBatchesMs);
    }
  }

  const totalSent = allResults.reduce((a, r) => a + r.sent, 0);
  const totalFailed = allResults.reduce((a, r) => a + r.failed, 0);
  logger.info(`Disparo concluído: enviados=${totalSent} falhas=${totalFailed} em ${bms.length} BM(s)`);
  return allResults;
}
