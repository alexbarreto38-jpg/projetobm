#!/usr/bin/env node
// CLI do projetobm.
//
// Comandos:
//   upload-templates  Sobe um template para várias BMs em massa
//   check-templates   Consulta o status de aprovação dos templates nas BMs
//   dispatch          Dispara mensagens de template das BMs em lotes de 250
//
// Exemplos:
//   projetobm upload-templates --bms bms.csv --template template.json
//   projetobm check-templates --bms bms.csv --name meu_template
//   projetobm dispatch --bms bms.csv --recipients recipients.csv \
//       --template-name meu_template --lang pt_BR --batch-size 250

import fs from 'node:fs';
import { logger } from './logger.js';
import { loadBMs, loadTemplate, loadRecipients } from './config.js';
import { uploadTemplateToBMs, checkTemplatesOnBMs } from './templates.js';
import { dispatchInBatches } from './dispatch.js';
import { toCSV } from './csv.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function writeResults(outPath, results, columns) {
  if (!outPath) return;
  fs.writeFileSync(outPath, toCSV(results, columns));
  logger.info(`Resultados salvos em ${outPath}`);
}

function usage() {
  console.log(`
projetobm — templates e disparo em massa na Meta (WhatsApp Cloud API)

Uso:
  projetobm upload-templates --bms <bms.csv> --template <template.json> [opções]
  projetobm check-templates --bms <bms.csv> [--name <template>] [opções]
  projetobm dispatch --bms <bms.csv> --template-name <nome> [opções]

Opções comuns:
  --bms <arquivo>          CSV de BMs (colunas: name,token,waba_id,phone_id)
  --version <vXX.X>        Versão da Graph API (padrão: env META_API_VERSION ou v21.0)
  --concurrency <n>        BMs simultâneas (padrão: 10)
  --out <arquivo.csv>      Salva o relatório de resultados
  --dry-run                Valida e mostra o que seria feito, sem chamar a API

upload-templates:
  --template <arquivo>     JSON do template (name, language, category, components)

check-templates:
  --name <template>        Filtra por um template (mostra status por BM).
                           Sem --name, resume a contagem por status em cada BM.

dispatch:
  --template-name <nome>   Nome do template já aprovado nas BMs
  --api <cloud|mmlite>     cloud = Cloud API (/messages, utility/auth/marketing)
                           mmlite = Marketing Messages Lite (/marketing_messages,
                           recomendado p/ marketing). Padrão: cloud
  --lang <código>          Código de idioma (padrão: pt_BR)
  --recipients <arquivo>   CSV de destinatários (coluna phone; body1,body2,... para variáveis)
  --batch-size <n>         BMs por lote (padrão: 250)
  --limit <n>              Trava de segurança: máx. de mensagens na rodada (0 = sem limite)
  --bm-concurrency <n>     BMs simultâneas dentro do lote (padrão: 25)
  --rcpt-concurrency <n>   Envios simultâneos por BM (padrão: 10)
  --delay-batches <ms>     Espera entre lotes em ms (padrão: 0)
`);
}

async function cmdUpload(args) {
  const bms = loadBMs(requireArg(args, 'bms'));
  const template = loadTemplate(requireArg(args, 'template'));

  if (args['dry-run']) {
    logger.info(`[dry-run] Subiria template "${template.name}" em ${bms.length} BM(s):`);
    bms.forEach((b) => logger.info(`  - ${b.name} (waba_id=${b.wabaId || 'FALTA'})`));
    return;
  }

  const results = await uploadTemplateToBMs(bms, template, {
    concurrency: Number(args.concurrency) || 10,
    version: args.version,
  });
  writeResults(args.out, results, ['bm', 'wabaId', 'ok', 'templateId', 'status', 'error']);
}

async function cmdCheck(args) {
  const bms = loadBMs(requireArg(args, 'bms'));
  const name = args.name && args.name !== true ? args.name : undefined;

  if (args['dry-run']) {
    logger.info(`[dry-run] Checaria template${name ? ` "${name}"` : 's'} em ${bms.length} BM(s)`);
    return;
  }

  const results = await checkTemplatesOnBMs(bms, {
    name,
    concurrency: Number(args.concurrency) || 10,
    version: args.version,
  });
  writeResults(args.out, results, ['bm', 'wabaId', 'found', 'status', 'category', 'templateId', 'error']);
}

async function cmdDispatch(args) {
  const bms = loadBMs(requireArg(args, 'bms'));
  const templateName = requireArg(args, 'template-name');
  const recipients = args.recipients ? loadRecipients(args.recipients) : [];
  const batchSize = Number(args['batch-size']) || 250;
  const api = (args.api || 'cloud').toLowerCase();
  if (!['cloud', 'mmlite'].includes(api)) {
    throw new Error(`--api inválido: "${api}" (use "cloud" ou "mmlite")`);
  }
  const maxMessages = Number(args.limit) || 0;

  if (args['dry-run']) {
    const limitTxt = maxMessages > 0 ? ` (limite=${maxMessages} msgs)` : '';
    logger.info(
      `[dry-run] Disparo (${api}) de "${templateName}" para ${bms.length} BM(s) em lotes de ${batchSize}, ` +
        `${recipients.length} destinatário(s) por BM${limitTxt}`
    );
    return;
  }

  const results = await dispatchInBatches(bms, {
    templateName,
    languageCode: args.lang || 'pt_BR',
    recipients,
    batchSize,
    api,
    maxMessages,
    bmConcurrency: Number(args['bm-concurrency']) || 25,
    recipientConcurrency: Number(args['rcpt-concurrency']) || 10,
    delayBetweenBatchesMs: Number(args['delay-batches']) || 0,
    version: args.version,
  });

  const flat = results.map((r) => ({
    bm: r.bm,
    phoneId: r.phoneId,
    ok: r.ok,
    sent: r.sent,
    failed: r.failed,
    skipped: r.skipped || 0,
    total: r.total,
    error: r.error || '',
  }));
  writeResults(args.out, flat, ['bm', 'phoneId', 'ok', 'sent', 'failed', 'skipped', 'total', 'error']);
}

function requireArg(args, name) {
  const v = args[name];
  if (!v || v === true) {
    throw new Error(`Argumento obrigatório ausente: --${name}`);
  }
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args._[0];

  try {
    switch (command) {
      case 'upload-templates':
        await cmdUpload(args);
        break;
      case 'check-templates':
        await cmdCheck(args);
        break;
      case 'dispatch':
        await cmdDispatch(args);
        break;
      case 'help':
      case undefined:
        usage();
        break;
      default:
        logger.error(`Comando desconhecido: ${command}`);
        usage();
        process.exitCode = 1;
    }
  } catch (err) {
    logger.error(err.message);
    process.exitCode = 1;
  }
}

main();
