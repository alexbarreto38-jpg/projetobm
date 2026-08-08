import { z } from 'zod';

/**
 * Criação de campanha (spec §23, §39). Seleciona template + contas (e,
 * opcionalmente, números específicos). O público é resolvido no processamento,
 * sempre excluindo opt-out e respeitando consentimento (spec §21, §22, §24).
 */
export const createCampaignSchema = z.object({
  name: z.string().min(2).max(160),
  templateId: z.string().min(1),
  accountIds: z.array(z.string().min(1)).min(1, 'selecione ao menos uma conta'),
  phoneNumberIds: z.array(z.string().min(1)).optional(),
  scheduledAt: z.string().datetime().optional(),
  /**
   * Exigir consentimento do tipo da categoria do template. Quando omitido, o
   * preflight infere pela categoria (MARKETING exige opt-in).
   */
  requireConsent: z.boolean().optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const startCampaignSchema = z.object({
  /** Confirmar mesmo com WARNING no preflight (spec §24). BLOCKED nunca inicia. */
  acknowledgeWarnings: z.boolean().optional(),
});
export type StartCampaignInput = z.infer<typeof startCampaignSchema>;
