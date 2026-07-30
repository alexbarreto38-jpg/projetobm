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

// Consulta o status dos templates em cada BM. Se `name` for informado,
// filtra por esse template; senão, resume todos.
// Retorna um array por BM com: found, status, category, templateId.
export async function checkTemplatesOnBMs(bms, { name, concurrency = 10, version } = {}) {
  logger.info(
    `Checando templates${name ? ` "${name}"` : ''} em ${bms.length} BM(s), concorrência=${concurrency}`
  );

  const settled = await mapWithConcurrency(bms, concurrency, async (bm) => {
    if (!bm.wabaId) {
      throw new MetaApiError('BM sem waba_id (necessário para checar templates)', {});
    }
    const client = new MetaClient({ token: bm.token, version });
    const resp = await client.listTemplates(bm.wabaId, { limit: 200 });
    return resp?.data ?? [];
  });

  const results = settled.map((s, i) => {
    const bm = bms[i];
    if (s.status !== 'fulfilled') {
      const err = s.reason;
      const msg = err instanceof MetaApiError ? `${err.message} (code=${err.code})` : err.message;
      logger.error(`ERRO ${bm.name}: ${msg}`);
      return { bm: bm.name, wabaId: bm.wabaId, found: false, status: 'error', category: '', templateId: '', error: msg };
    }

    const list = s.value;
    if (name) {
      const t = list.find((x) => x.name === name);
      if (!t) {
        logger.warn(`AUSENTE ${bm.name}: template "${name}" não existe`);
        return { bm: bm.name, wabaId: bm.wabaId, found: false, status: 'not_found', category: '', templateId: '', error: '' };
      }
      const level = t.status === 'APPROVED' ? 'info' : 'warn';
      logger[level](`${bm.name}: "${name}" status=${t.status}`);
      return { bm: bm.name, wabaId: bm.wabaId, found: true, status: t.status, category: t.category || '', templateId: t.id || '', error: '' };
    }

    // sem filtro: resume contagem por status
    const byStatus = {};
    for (const t of list) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const summary = Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(' ') || 'nenhum';
    logger.info(`${bm.name}: ${list.length} template(s) [${summary}]`);
    return { bm: bm.name, wabaId: bm.wabaId, found: list.length > 0, status: summary, category: '', templateId: '', error: '' };
  });

  if (name) {
    const approved = results.filter((r) => r.status === 'APPROVED').length;
    logger.info(`Aprovados: ${approved}/${results.length} BM(s) prontos para disparar "${name}"`);
  }
  return results;
}
