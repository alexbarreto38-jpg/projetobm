export {
  MetaProvider,
  type MetaProviderConfig,
  type TokenExchangeResult,
} from './MetaProvider.js';
export {
  MetaGraphClient,
  type MetaGraphClientConfig,
  type GraphRequestOptions,
} from './graph/MetaGraphClient.js';
export {
  MetaApiError,
  metaErrorFromResponse,
  type MetaApiErrorInit,
  type MetaErrorCategory,
} from './errors/MetaApiError.js';
export { CredentialVault, type VaultKey } from './credentials/CredentialVault.js';
export {
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from './webhooks/verify.js';
export {
  MetaMockServer,
  type MetaMockOptions,
  type MockWaba,
  type MockPhoneNumber,
  type MockErrorSpec,
} from './testing/MetaMockServer.js';
export { resolveAdapter } from './adapters/resolveAdapter.js';
export { LegacyWabaAdapter } from './adapters/LegacyWabaAdapter.js';
export { NewAccountModelAdapter } from './adapters/NewAccountModelAdapter.js';
export type {
  WhatsAppAccountAdapter,
  AdapterContext,
  AccountInfo,
  PhoneNumberInfo,
  TemplateInfo,
  CreateTemplateInput,
  SendMessageInput,
  SendMessageResult,
  HealthReport,
} from './adapters/WhatsAppAccountAdapter.js';
