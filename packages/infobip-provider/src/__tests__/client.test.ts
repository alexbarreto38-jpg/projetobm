import { describe, expect, it } from 'vitest';
import { InfobipClient } from '../client.js';
import { InfobipApiError } from '../errors.js';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }) as Response) as unknown as typeof fetch;
}

describe('InfobipClient', () => {
  it('lê o saldo (spec §11)', async () => {
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'k',
      fetchImpl: fakeFetch(200, { balance: 42.8, currency: 'BRL' }),
    });
    expect(await client.getBalance()).toEqual({ balance: 42.8, currency: 'BRL' });
  });

  it('envia o header Authorization App', async () => {
    let seen: RequestInit | undefined;
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'secret',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = init;
        return { ok: true, status: 200, text: async () => '{"balance":1,"currency":"BRL"}' } as Response;
      }) as unknown as typeof fetch,
    });
    await client.getBalance();
    expect((seen?.headers as Record<string, string>).authorization).toBe('App secret');
  });

  it('traduz erros preservando os campos do Infobip (spec §22)', async () => {
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'k',
      fetchImpl: fakeFetch(401, {
        requestError: { serviceException: { messageId: 'UNAUTHORIZED', text: 'Invalid login details' } },
      }),
    });
    await expect(client.getBalance()).rejects.toBeInstanceOf(InfobipApiError);
    try {
      await client.getBalance();
    } catch (e) {
      const err = e as InfobipApiError;
      expect(err.status).toBe(401);
      expect(err.messageId).toBe('UNAUTHORIZED');
      expect(err.toUserMessage()).toContain('credenciais do Infobip');
    }
  });
});
