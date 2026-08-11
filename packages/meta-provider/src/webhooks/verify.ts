import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação de webhook da Meta (spec §30).
 *
 * 1) Handshake GET: a Meta envia hub.mode=subscribe, hub.verify_token e
 *    hub.challenge. Respondemos o challenge somente se o token bater.
 * 2) POST: validar a assinatura `X-Hub-Signature-256: sha256=<hmac>` calculada
 *    com o App Secret sobre o corpo BRUTO da requisição.
 *
 * Referência: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyWebhookChallenge(
  params: { mode?: string; token?: string; challenge?: string },
  expectedToken: string,
): string | null {
  if (params.mode === 'subscribe' && params.token && safeEqualStr(params.token, expectedToken)) {
    return params.challenge ?? '';
  }
  return null;
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  const hmac = createHmac('sha256', appSecret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');
  return safeEqualStr(hmac, expected);
}

function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
