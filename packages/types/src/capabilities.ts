/**
 * Capability detection (spec §58). A UI e os adapters se adaptam ao que a
 * conta realmente suporta — não dependemos só de feature flags.
 *
 * Os nomes das capacidades ligadas ao modelo novo (messagingAccountTemplates,
 * coexistence) só devem ser considerados verdadeiros após confirmação via API
 * oficial da Meta para a conta específica.
 */
export interface AccountCapabilities {
  /** Templates criados diretamente na WABA (modelo legado). */
  legacyTemplates: boolean;
  /** Templates vinculados a uma Messaging Account (modelo novo 2026). */
  messagingAccountTemplates: boolean;
  /** Conta opera em coexistência (app WhatsApp Business + API). */
  coexistence: boolean;
  /** Suporta separação identidade/número (Phone Account) do modelo novo. */
  phoneIdentitySeparation: boolean;
}

export const DEFAULT_CAPABILITIES: AccountCapabilities = {
  legacyTemplates: true,
  messagingAccountTemplates: false,
  coexistence: false,
  phoneIdentitySeparation: false,
};

export type AccountModel = 'LEGACY' | 'NEW_MODEL' | 'UNKNOWN';
