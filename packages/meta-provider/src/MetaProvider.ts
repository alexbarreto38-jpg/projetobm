import type { AccountModel } from '@wise/types';
import { MetaGraphClient, type MetaGraphClientConfig } from './graph/MetaGraphClient.js';
import { resolveAdapter } from './adapters/resolveAdapter.js';
import type { WhatsAppAccountAdapter } from './adapters/WhatsAppAccountAdapter.js';
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from './webhooks/verify.js';

/**
 * MetaProvider — camada independente por onde passam TODAS as interações com a
 * Meta (spec §3). A aplicação nunca espalha chamadas à Graph API pelo código;
 * ela conversa com o provider, que delega ao adapter correto do modelo de conta.
 *
 * Subdomínios conceituais (spec §3):
 *   onboarding · businesses · accounts · phoneNumbers · messagingAccounts ·
 *   templates · messages · webhooks · health
 *
 * As Fases 3–8 preencherão cada subdomínio usando `adapterFor()` + o
 * MetaGraphClient, sempre confirmando endpoints na documentação oficial.
 */
export interface MetaProviderConfig extends MetaGraphClientConfig {
  appId: string;
  appSecret: string;
  /** redirect_uri padrão usado na troca de code por token (Embedded Signup). */
  defaultRedirectUri?: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  tokenType?: string;
  expiresInSeconds?: number;
}

export class MetaProvider {
  readonly graph: MetaGraphClient;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly defaultRedirectUri?: string;

  constructor(config: MetaProviderConfig) {
    this.graph = new MetaGraphClient(config);
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.defaultRedirectUri = config.defaultRedirectUri;
  }

  // --- onboarding / oauth (spec §7) ----------------------------------------
  oauth = {
    /**
     * Troca o `code` do Embedded Signup por um access token (server-side).
     * O App Secret nunca sai do backend (spec §8, §46).
     *
     * Endpoint: GET /{version}/oauth/access_token
     *   ?client_id&client_secret&code&redirect_uri
     * Confirmar parâmetros na doc oficial de Facebook Login antes de produção.
     */
    exchangeCode: async (
      code: string,
      redirectUri?: string,
      requestId?: string,
    ): Promise<TokenExchangeResult> => {
      const res = await this.graph.get<{
        access_token?: string;
        token_type?: string;
        expires_in?: number;
      }>('oauth/access_token', {
        requestId,
        query: {
          client_id: this.appId,
          client_secret: this.appSecret,
          code,
          redirect_uri: redirectUri ?? this.defaultRedirectUri,
        },
      });
      if (!res.access_token) {
        throw new Error('Resposta de troca de token sem access_token.');
      }
      return {
        accessToken: res.access_token,
        tokenType: res.token_type,
        expiresInSeconds: res.expires_in,
      };
    },
  };

  /** Retorna o adapter (Legacy/New) para o modelo da conta. */
  adapterFor(model: AccountModel): WhatsAppAccountAdapter {
    return resolveAdapter(model, this.graph);
  }

  // --- webhooks (spec §30) -------------------------------------------------
  webhooks = {
    verifyChallenge: (
      params: { mode?: string; token?: string; challenge?: string },
      expectedToken: string,
    ) => verifyWebhookChallenge(params, expectedToken),
    verifySignature: (rawBody: string | Buffer, signatureHeader: string | undefined) =>
      verifyWebhookSignature(rawBody, signatureHeader, this.appSecret),
  };
}
