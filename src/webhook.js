// Servidor de webhook para receber status de entrega da Meta
// (sent / delivered / read / failed) e mensagens recebidas (inbound).
//
// A Meta faz:
//   GET  /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//        -> handshake de verificação; devolvemos o challenge se o token bater.
//   POST /webhook  (com header X-Hub-Signature-256: sha256=<hmac>)
//        -> payload de eventos; validamos a assinatura com o App Secret.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { logger } from './logger.js';
import { toCSV } from './csv.js';

// Confere a assinatura HMAC-SHA256 que a Meta envia no header.
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true; // sem segredo configurado, não valida (dev)
  if (!signatureHeader) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Extrai eventos normalizados de um payload de webhook do WhatsApp.
// Retorna { statuses: [...], messages: [...] }.
export function parseWebhookPayload(payload) {
  const statuses = [];
  const messages = [];
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneId = value.metadata?.phone_number_id ?? '';
      for (const st of value.statuses ?? []) {
        statuses.push({
          type: 'status',
          phoneId,
          messageId: st.id ?? '',
          recipient: st.recipient_id ?? '',
          status: st.status ?? '',
          timestamp: st.timestamp ?? '',
          errorCode: st.errors?.[0]?.code ?? '',
          errorTitle: st.errors?.[0]?.title ?? '',
        });
      }
      for (const m of value.messages ?? []) {
        messages.push({
          type: 'message',
          phoneId,
          messageId: m.id ?? '',
          from: m.from ?? '',
          msgType: m.type ?? '',
          timestamp: m.timestamp ?? '',
          text: m.text?.body ?? '',
        });
      }
    }
  }
  return { statuses, messages };
}

// Grava linhas de status em CSV (append; escreve cabeçalho na criação).
function appendStatusesCSV(outPath, statuses) {
  if (!outPath || statuses.length === 0) return;
  const columns = ['phoneId', 'messageId', 'recipient', 'status', 'timestamp', 'errorCode', 'errorTitle'];
  const exists = fs.existsSync(outPath);
  if (!exists) {
    fs.writeFileSync(outPath, toCSV(statuses, columns));
  } else {
    // sem cabeçalho ao anexar
    const body = toCSV(statuses, columns).split('\n').slice(1).join('\n');
    fs.appendFileSync(outPath, body);
  }
}

// Sobe o servidor. Resolve quando está ouvindo; devolve { url, port, close, stats }.
export function startWebhookServer({
  port = 3000,
  path = '/webhook',
  verifyToken,
  appSecret,
  out,
  onEvent,
} = {}) {
  const stats = { statuses: 0, messages: 0, rejected: 0 };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname !== path) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Handshake de verificação
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === verifyToken) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(challenge ?? '');
        logger.info('Webhook verificado com sucesso');
      } else {
        res.writeHead(403);
        res.end('Forbidden');
        logger.warn('Handshake de webhook rejeitado (token inválido)');
      }
      return;
    }

    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const sig = req.headers['x-hub-signature-256'];
        if (!verifySignature(raw, sig, appSecret)) {
          stats.rejected++;
          res.writeHead(401);
          res.end('invalid signature');
          logger.warn('POST rejeitado: assinatura inválida');
          return;
        }

        let payload;
        try {
          payload = JSON.parse(raw || '{}');
        } catch {
          res.writeHead(400);
          res.end('bad json');
          return;
        }

        const { statuses, messages } = parseWebhookPayload(payload);
        stats.statuses += statuses.length;
        stats.messages += messages.length;

        for (const s of statuses) {
          const errTxt = s.errorCode ? ` erro=${s.errorCode}/${s.errorTitle}` : '';
          logger.info(`status ${s.status} msg=${s.messageId} para=${s.recipient}${errTxt}`);
        }
        for (const m of messages) {
          logger.info(`inbound de ${m.from} tipo=${m.msgType} msg=${m.messageId}`);
        }

        appendStatusesCSV(out, statuses);
        if (onEvent) onEvent({ statuses, messages });

        // sempre 200 rápido para a Meta não reenviar
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('EVENT_RECEIVED');
      });
      return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const actualPort = server.address().port;
      logger.info(`Webhook ouvindo em http://localhost:${actualPort}${path}`);
      resolve({
        port: actualPort,
        url: `http://localhost:${actualPort}${path}`,
        stats,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
