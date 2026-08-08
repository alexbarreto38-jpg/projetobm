import { CredentialVault, MetaProvider } from '@wise/meta-provider';

/**
 * Contexto Meta injetado na aplicação. Construído a partir do ambiente em
 * produção (server.ts) ou com um MetaProvider apoiado no MetaMockServer nos
 * testes (spec §61). Segredos vivem apenas aqui, no backend (spec §46).
 */
export interface MetaContext {
  provider: MetaProvider;
  vault: CredentialVault;
  appId: string;
  configId?: string;
  graphVersion: string;
  defaultRedirectUri?: string;
}

export interface MetaEnv {
  appId: string;
  appSecret: string;
  graphBaseUrl: string;
  graphVersion: string;
  encryptionKey: string;
  encryptionKeyPrevious?: string;
  configId?: string;
  defaultRedirectUri?: string;
}

/** Monta o MetaContext a partir de variáveis de ambiente já validadas. */
export function buildMetaContext(envValues: MetaEnv): MetaContext {
  const provider = new MetaProvider({
    baseUrl: envValues.graphBaseUrl,
    version: envValues.graphVersion,
    appId: envValues.appId,
    appSecret: envValues.appSecret,
    defaultRedirectUri: envValues.defaultRedirectUri,
  });
  const vault = CredentialVault.fromEnv(envValues.encryptionKey, envValues.encryptionKeyPrevious);
  return {
    provider,
    vault,
    appId: envValues.appId,
    configId: envValues.configId,
    graphVersion: envValues.graphVersion,
    defaultRedirectUri: envValues.defaultRedirectUri,
  };
}
