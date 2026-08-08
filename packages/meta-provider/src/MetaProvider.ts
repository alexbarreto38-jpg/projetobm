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
  appSecret: string;
}

export class MetaProvider {
  readonly graph: MetaGraphClient;
  private readonly appSecret: string;

  constructor(config: MetaProviderConfig) {
    this.graph = new MetaGraphClient(config);
    this.appSecret = config.appSecret;
  }

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
