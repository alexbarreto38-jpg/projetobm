import { CredentialVault, MetaProvider } from '@wise/meta-provider';

export interface WorkerMeta {
  provider: MetaProvider;
  vault: CredentialVault;
}

/** Constrói provider + vault a partir do ambiente (mesmas variáveis da API). */
export function buildWorkerMeta(): WorkerMeta {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!appId || !appSecret || !encryptionKey) {
    throw new Error('Variáveis Meta ausentes (META_APP_ID/META_APP_SECRET/ENCRYPTION_KEY).');
  }
  const provider = new MetaProvider({
    baseUrl: process.env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com',
    version: process.env.META_GRAPH_VERSION ?? 'v23.0',
    appId,
    appSecret,
  });
  const vault = CredentialVault.fromEnv(encryptionKey, process.env.ENCRYPTION_KEY_PREVIOUS);
  return { provider, vault };
}
