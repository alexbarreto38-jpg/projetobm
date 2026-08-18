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

  it('envia mensagem de texto de sessão (spec §3)', async () => {
    let seenUrl = '';
    let seenBody: unknown;
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'k',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seenUrl = String(url);
        seenBody = JSON.parse(String(init.body));
        return { ok: true, status: 200, text: async () => '{"messages":[]}' } as Response;
      }) as unknown as typeof fetch,
    });
    await client.sendTextMessage({ from: '5511b', to: '5511a', text: 'oi' });
    expect(seenUrl).toContain('/whatsapp/1/message/text');
    expect(seenBody).toEqual({ from: '5511b', to: '5511a', content: { text: 'oi' } });
  });

  it('baixa mídia com autenticação, só do host da conta Infobip (spec §3)', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'k',
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: (h: string) => (h === 'content-type' ? 'audio/ogg' : null) },
          arrayBuffer: async () => bytes.buffer,
        }) as unknown as Response) as unknown as typeof fetch,
    });
    const media = await client.downloadMedia('https://x.api.infobip.com/whatsapp/1/media/abc');
    expect(media.contentType).toBe('audio/ogg');
    expect(Array.from(media.data)).toEqual([1, 2, 3]);
  });

  it('recusa baixar mídia de host arbitrário — não vaza a API key (SSRF)', async () => {
    let called = false;
    const client = new InfobipClient({
      baseUrl: 'https://x.api.infobip.com',
      apiKey: 'k',
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    await expect(client.downloadMedia('https://attacker.example/x')).rejects.toThrow(/host de mídia não permitido/);
    await expect(client.downloadMedia('http://x.api.infobip.com/x')).rejects.toThrow(/host de mídia não permitido/);
    expect(called).toBe(false); // nunca chega a fazer o fetch (nem envia o header)
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
