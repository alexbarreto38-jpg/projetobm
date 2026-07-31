#!/usr/bin/env node
// CLI do projetobm.
//
// Comandos:
//   upload-templates  Sobe um template para várias BMs em massa
//   check-templates   Consulta o status de aprovação dos templates nas BMs
//   dispatch          Dispara mensagens de template das BMs em lotes de 250
//   webhook           Recebe status de entrega (sent/delivered/read/failed)
//
// Exemplos:
//   projetobm upload-templates --bms bms.csv --template template.json
//   projetobm check-templates --bms bms.csv --name meu_template
//   projetobm dispatch --bms bms.csv --recipients recipients.csv \
//       --template-name meu_template --lang pt_BR --batch-size 250
//   projetobm webhook --port 3000 --verify-token meutoken --out status.csv

import fs from 'node:fs';
import { logger } from './logger.js';
import { loadBMs, loadTemplate, loadRecipients } from './config.js';
import { uploadTemplateToBMs, checkTemplatesOnBMs } from './templates.js';
import { dispatchInBatches } from './dispatch.js';
import { startWebhookServer } from './webhook.js';
import { reconcileFiles } from './reconcile.js';
import { planRetry, loadFinalReport, DEFAULT_RETRY_STATUSES } from './retry.js';
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
  projetobm webhook --verify-token <token> [--port 3000] [--out status.csv]
  projetobm reconcile --sends <sends.csv> --status <status.csv> [--out final.csv]
  projetobm retry --bms <bms.csv> --from <final.csv> --template-name <nome> [opções]

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
  --require-approved       Antes de enviar, checa o template em cada BM e
                           BLOQUEIA as que não estão APPROVED (recomendado)
  --sends-out <arquivo>    CSV detalhado por envio (com messageId), p/ reconciliar
  --bm-concurrency <n>     BMs simultâneas dentro do lote (padrão: 25)
  --rcpt-concurrency <n>   Envios simultâneos por BM (padrão: 10)
  --delay-batches <ms>     Espera entre lotes em ms (padrão: 0)

webhook:
  --verify-token <token>   Token do handshake (ou env WEBHOOK_VERIFY_TOKEN)
  --app-secret <segredo>   App Secret p/ validar assinatura (ou env META_APP_SECRET)
  --port <n>               Porta HTTP (padrão: 3000)
  --path <caminho>         Caminho do endpoint (padrão: /webhook)
  --out <status.csv>       Anexa os status recebidos neste CSV

reconcile:
  --sends <arquivo>        CSV de envios gerado pelo dispatch (--sends-out)
  --status <arquivo>       CSV de status gerado pelo webhook (--out)
  --out <final.csv>        Salva o relatório final; sem --out, imprime o resumo

retry (reprocessa só quem falhou; aceita as mesmas opções de dispatch):
  --from <final.csv>       Relatório da reconciliação
  --template-name <nome>   Template a reenviar
  --statuses <a,b>         Status a reprocessar (padrão: failed,send_failed)
  --include-no-status      Também reenvia os "no_status" (cuidado: pode duplicar)
  --recipients <arquivo>   CSV original, p/ recuperar as variáveis do template
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
  const requireApproved = !!args['require-approved'];

  if (args['dry-run']) {
    const limitTxt = maxMessages > 0 ? ` (limite=${maxMessages} msgs)` : '';
    const guardTxt = requireApproved ? ' [só BMs com template APPROVED]' : '';
    logger.info(
      `[dry-run] Disparo (${api}) de "${templateName}" para ${bms.length} BM(s) em lotes de ${batchSize}, ` +
        `${recipients.length} destinatário(s) por BM${limitTxt}${guardTxt}`
    );
    return;
  }

  // Trava de segurança: só dispara nas BMs onde o template está APPROVED.
  let targetBMs = bms;
  if (requireApproved) {
    logger.info('Verificando aprovação do template antes de disparar...');
    const status = await checkTemplatesOnBMs(bms, {
      name: templateName,
      concurrency: Number(args.concurrency) || 10,
      version: args.version,
    });
    const approvedNames = new Set(status.filter((s) => s.status === 'APPROVED').map((s) => s.bm));
    targetBMs = bms.filter((b) => approvedNames.has(b.name));
    const blocked = bms.length - targetBMs.length;
    if (blocked > 0) {
      logger.warn(`${blocked} BM(s) sem template APPROVED foram BLOQUEADAS (não vão receber disparo)`);
    }
    if (targetBMs.length === 0) {
      logger.error('Nenhuma BM com o template aprovado. Disparo abortado.');
      return;
    }
  }

  const results = await dispatchInBatches(targetBMs, {
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

  // CSV detalhado por envio (com messageId) para reconciliar com o webhook
  const sendsOut = args['sends-out'];
  if (sendsOut && sendsOut !== true) {
    const sends = results.flatMap((r) => r.sends || []);
    writeResults(sendsOut, sends, ['bm', 'phoneId', 'to', 'messageId', 'sendStatus', 'error']);
  }
}

async function cmdReconcile(args) {
  const sendsPath = requireArg(args, 'sends');
  const statusPath = requireArg(args, 'status');
  const { rows, summary } = reconcileFiles(sendsPath, statusPath);
  const out = args.out && args.out !== true ? args.out : undefined;
  if (out) {
    writeResults(out, rows, ['bm', 'to', 'messageId', 'finalStatus', 'errorCode', 'errorTitle', 'sendError']);
  } else {
    // sem --out, imprime o resumo
    const txt = Object.entries(summary).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    logger.info(`Resumo por status final:\n${txt}`);
  }
}

async function cmdRetry(args) {
  const bms = loadBMs(requireArg(args, 'bms'));
  const templateName = requireArg(args, 'template-name');
  const finalRows = loadFinalReport(requireArg(args, 'from'));

  // status a reprocessar (padrão: failed,send_failed)
  const statuses =
    args.statuses && args.statuses !== true
      ? String(args.statuses).split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_RETRY_STATUSES.slice();
  if (args['include-no-status'] && !statuses.includes('no_status')) {
    statuses.push('no_status');
  }

  // recupera variáveis originais do template por telefone, se informado
  let recipientsByPhone;
  if (args.recipients && args.recipients !== true) {
    recipientsByPhone = new Map();
    for (const r of loadRecipients(args.recipients)) recipientsByPhone.set(r.phone, r);
  }

  const { byBM, count, byStatus } = planRetry(finalRows, { statuses, recipientsByPhone });
  const statusTxt = Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(' ') || 'nenhum';
  logger.info(`Reprocessar [${statuses.join(',')}]: ${count} destinatário(s) [${statusTxt}]`);

  if (count === 0) {
    logger.info('Nada a reprocessar.');
    return;
  }

  // só as BMs que têm alguém para reenviar
  const targetBMs = bms.filter((b) => byBM.has(b.name));
  const semToken = [...byBM.keys()].filter((name) => !bms.some((b) => b.name === name));
  if (semToken.length) {
    logger.warn(`BM(s) do relatório sem credencial no --bms (ignoradas): ${semToken.join(', ')}`);
  }

  const api = (args.api || 'cloud').toLowerCase();
  if (!['cloud', 'mmlite'].includes(api)) {
    throw new Error(`--api inválido: "${api}" (use "cloud" ou "mmlite")`);
  }

  if (args['dry-run']) {
    logger.info(`[dry-run] Reenviaria "${templateName}" (${api}) para ${count} destinatário(s) em ${targetBMs.length} BM(s)`);
    return;
  }

  const results = await dispatchInBatches(targetBMs, {
    templateName,
    languageCode: args.lang || 'pt_BR',
    recipientsByBM: byBM,
    batchSize: Number(args['batch-size']) || 250,
    api,
    maxMessages: Number(args.limit) || 0,
    bmConcurrency: Number(args['bm-concurrency']) || 25,
    recipientConcurrency: Number(args['rcpt-concurrency']) || 10,
    delayBetweenBatchesMs: Number(args['delay-batches']) || 0,
    version: args.version,
  });

  const sendsOut = args['sends-out'];
  if (sendsOut && sendsOut !== true) {
    const sends = results.flatMap((r) => r.sends || []);
    writeResults(sendsOut, sends, ['bm', 'phoneId', 'to', 'messageId', 'sendStatus', 'error']);
  }
}

async function cmdWebhook(args) {
  const verifyToken =
    (args['verify-token'] !== true && args['verify-token']) || process.env.WEBHOOK_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET || (args['app-secret'] !== true && args['app-secret']);
  if (!verifyToken) {
    throw new Error('Informe --verify-token ou a env WEBHOOK_VERIFY_TOKEN');
  }
  if (!appSecret) {
    logger.warn('Sem App Secret (--app-secret / META_APP_SECRET): assinatura NÃO será validada');
  }

  await startWebhookServer({
    port: Number(args.port) || 3000,
    path: (args.path !== true && args.path) || '/webhook',
    verifyToken,
    appSecret: appSecret || undefined,
    out: args.out,
  });
  logger.info('Ctrl+C para encerrar. Aguardando eventos da Meta...');
  // mantém o processo vivo
  await new Promise(() => {});
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
      case 'webhook':
        await cmdWebhook(args);
        break;
      case 'reconcile':
        await cmdReconcile(args);
        break;
      case 'retry':
        await cmdRetry(args);
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
