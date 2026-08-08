import { describe, expect, it } from 'vitest';
import { MetaProvider } from '../MetaProvider.js';
import { MetaMockServer } from '../testing/MetaMockServer.js';
import { MetaApiError } from '../errors/MetaApiError.js';

function makeProvider(server: MetaMockServer) {
  return new MetaProvider({
    baseUrl: 'https://graph.facebook.com',
    version: 'v23.0',
    appId: 'APP_ID',
    appSecret: 'APP_SECRET',
    defaultRedirectUri: 'https://app.local/callback',
    fetchImpl: server.fetch,
  });
}

describe('MetaProvider contra MetaMockServer', () => {
  it('troca code por token sem enviar Authorization bearer', async () => {
    const server = new MetaMockServer({ exchangedToken: 'TOK_123' });
    const provider = makeProvider(server);
    const result = await provider.oauth.exchangeCode('the-code');
    expect(result.accessToken).toBe('TOK_123');
    const call = server.calls.find((c) => c.url.includes('/oauth/access_token'));
    expect(call?.url).toContain('client_id=APP_ID');
    expect(call?.url).toContain('code=the-code');
  });

  it('LegacyWabaAdapter lê detalhes e números da WABA', async () => {
    const server = new MetaMockServer({
      wabas: [
        {
          id: 'WABA_1',
          name: 'Empresa Teste',
          currency: 'BRL',
          timezone_id: 'America/Sao_Paulo',
          phone_numbers: [
            { id: 'PN_1', display_phone_number: '+55 11 90000-0001', quality_rating: 'GREEN' },
          ],
        },
      ],
    });
    const provider = makeProvider(server);
    const adapter = provider.adapterFor('LEGACY');
    const ctx = { externalAccountId: 'WABA_1', accessToken: 'TOK' };

    const info = await adapter.getAccountInfo(ctx);
    expect(info.name).toBe('Empresa Teste');
    expect(info.currency).toBe('BRL');

    const numbers = await adapter.listPhoneNumbers(ctx);
    expect(numbers).toHaveLength(1);
    expect(numbers[0]!.externalPhoneNumberId).toBe('PN_1');
    expect(numbers[0]!.qualityStatus).toBe('GREEN');
  });

  it('propaga erro 401 como MetaApiError AUTH não-retryable', async () => {
    const server = new MetaMockServer({
      wabas: [{ id: 'WABA_1' }],
      failOn: { '/WABA_1': { httpStatus: 401, code: 190, message: 'token expirado' } },
    });
    const provider = makeProvider(server);
    const adapter = provider.adapterFor('LEGACY');
    await expect(
      adapter.getAccountInfo({ externalAccountId: 'WABA_1', accessToken: 'BAD' }),
    ).rejects.toMatchObject({ category: 'AUTH', retryable: false } satisfies Partial<MetaApiError>);
  });

  it('assina webhooks (subscribed_apps)', async () => {
    const server = new MetaMockServer({ wabas: [{ id: 'WABA_1' }] });
    const provider = makeProvider(server);
    const adapter = provider.adapterFor('LEGACY');
    await adapter.subscribeWebhooks({ externalAccountId: 'WABA_1', accessToken: 'TOK' });
    expect(server.calls.some((c) => c.url.includes('/WABA_1/subscribed_apps'))).toBe(true);
  });
});
