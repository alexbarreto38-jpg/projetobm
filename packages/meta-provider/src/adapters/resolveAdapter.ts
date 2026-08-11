import type { AccountModel } from '@wise/types';
import type { MetaGraphClient } from '../graph/MetaGraphClient.js';
import { LegacyWabaAdapter } from './LegacyWabaAdapter.js';
import { NewAccountModelAdapter } from './NewAccountModelAdapter.js';
import type { WhatsAppAccountAdapter } from './WhatsAppAccountAdapter.js';

/**
 * Seleciona o adapter conforme o modelo da conta (spec §59). UNKNOWN cai no
 * legado, que é o comportamento seguro/GA hoje.
 */
export function resolveAdapter(
  model: AccountModel,
  graph: MetaGraphClient,
): WhatsAppAccountAdapter {
  return model === 'NEW_MODEL'
    ? new NewAccountModelAdapter(graph)
    : new LegacyWabaAdapter(graph);
}
