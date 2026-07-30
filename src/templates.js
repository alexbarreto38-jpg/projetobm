// Sobe o mesmo template para várias BMs (WABAs) em massa.

import { logger } from './logger.js';
import { MetaClient, MetaApiError } from './metaClient.js';
import { mapWithConcurrency } from './batch.js';

// Sobe `template` para cada BM da lista.
// Retorna um array de resultados por BM.
export async function uploadTemplateToBMs(bms, template, { concurrency = 10, version } = {}) {
  logger.info(`Subindo template "${template.name}" em ${bms.length} BM(s), concorrência=${concurrency}`);

  const settled = await mapWithConcurrency(bms, concurrency, async (bm) => {
    if (!bm.wabaId) {
      throw new MetaApiError('BM sem waba_id (necessário para templates)', {});
    }
    const client = new MetaClient({ token: bm.token, version });
    const resp = await client.createTemplate(bm.wabaId, template);
    return resp;
  });

  const results = settled.map((s, i) => {
    const bm = bms[i];
    if (s.status === 'fulfilled') {
      const v = s.value || {};
      logger.info(`OK  ${bm.name}: template id=${v.id ?? '?'} status=${v.status ?? '?'}`);
      return {
        bm: bm.name,
        wabaId: bm.wabaId,
        ok: true,
        templateId: v.id,
        status: v.status,
        error: '',
      };
    }
    const err = s.reason;
    const msg = err instanceof MetaApiError ? `${err.message} (code=${err.code})` : err.message;
    logger.error(`ERRO ${bm.name}: ${msg}`);
    return {
      bm: bm.name,
      wabaId: bm.wabaId,
      ok: false,
      templateId: '',
      status: 'error',
      error: msg,
    };
  });

  const okCount = results.filter((r) => r.ok).length;
  logger.info(`Concluído: ${okCount}/${results.length} templates enviados com sucesso`);
  return results;
}
