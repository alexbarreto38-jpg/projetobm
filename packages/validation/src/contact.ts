import { z } from 'zod';

export const CONSENT_TYPES = ['MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE'] as const;

export const createContactSchema = z.object({
  phone: z.string().min(3),
  name: z.string().max(200).optional(),
  customFields: z.record(z.unknown()).optional(),
  source: z.string().max(120).optional(),
  /** País padrão para normalização quando o número não vier internacional. */
  defaultCountry: z.string().length(2).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

/** Registro de consentimento/opt-in (spec §21). */
export const recordConsentSchema = z.object({
  consentType: z.enum(CONSENT_TYPES),
  source: z.string().max(200).optional(),
  evidence: z.record(z.unknown()).optional(),
});
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

/** Opt-out (spec §22). */
export const optoutSchema = z.object({
  reason: z.string().max(300).optional(),
  source: z.string().max(120).optional(),
});
export type OptoutInput = z.infer<typeof optoutSchema>;

/**
 * Importação de contatos (spec §40). O CSV é enviado como texto; em produção,
 * prefira upload para armazenamento de objetos e processe por streaming.
 */
export const importContactsSchema = z.object({
  filename: z.string().max(255).optional(),
  csv: z.string().min(1, 'conteúdo CSV vazio'),
  source: z.string().max(120).optional(),
  defaultCountry: z.string().length(2).optional(),
});
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
