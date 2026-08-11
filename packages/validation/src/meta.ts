import { z } from 'zod';

/**
 * Conexão via Embedded Signup (spec §7): o frontend conclui o fluxo oficial e
 * envia o `code` + o `wabaId` (e opcionalmente o phoneNumberId) autorizados. A
 * troca de code por token acontece no backend.
 */
export const embeddedSignupCallbackSchema = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1).optional(),
  /** redirect_uri usado no fluxo, se diferente do padrão do servidor. */
  redirectUri: z.string().url().optional(),
});
export type EmbeddedSignupCallbackInput = z.infer<typeof embeddedSignupCallbackSchema>;

/**
 * Conexão por token de System User (uso administrativo/dev). Preferir Embedded
 * Signup sempre que o fluxo oficial permitir (spec §7).
 */
export const connectByTokenSchema = z.object({
  accessToken: z.string().min(1),
  wabaId: z.string().min(1),
});
export type ConnectByTokenInput = z.infer<typeof connectByTokenSchema>;
