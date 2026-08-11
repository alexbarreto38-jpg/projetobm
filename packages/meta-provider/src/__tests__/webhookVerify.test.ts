import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookChallenge, verifyWebhookSignature } from '../webhooks/verify.js';

describe('verifyWebhookChallenge', () => {
  it('retorna o challenge quando o token bate', () => {
    const out = verifyWebhookChallenge(
      { mode: 'subscribe', token: 'secret', challenge: '12345' },
      'secret',
    );
    expect(out).toBe('12345');
  });

  it('retorna null quando o token não bate', () => {
    expect(
      verifyWebhookChallenge({ mode: 'subscribe', token: 'wrong', challenge: '1' }, 'secret'),
    ).toBeNull();
  });

  it('retorna null quando o mode não é subscribe', () => {
    expect(
      verifyWebhookChallenge({ mode: 'unsubscribe', token: 'secret', challenge: '1' }, 'secret'),
    ).toBeNull();
  });
});

describe('verifyWebhookSignature', () => {
  const appSecret = 'app_secret';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const sig = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');

  it('aceita assinatura válida', () => {
    expect(verifyWebhookSignature(body, sig, appSecret)).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifyWebhookSignature(body, 'sha256=deadbeef', appSecret)).toBe(false);
  });

  it('rejeita header ausente', () => {
    expect(verifyWebhookSignature(body, undefined, appSecret)).toBe(false);
  });

  it('rejeita corpo adulterado', () => {
    expect(verifyWebhookSignature(body + 'x', sig, appSecret)).toBe(false);
  });
});
