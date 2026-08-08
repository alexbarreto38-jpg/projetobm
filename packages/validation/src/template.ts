import { z } from 'zod';

/**
 * Estrutura de template (spec §16). Os componentes seguem a forma da Meta
 * (header/body/footer/buttons); mantemos flexível e validamos o essencial.
 * A validação fina de cada tipo de componente deve acompanhar a doc oficial.
 */
export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE'] as const;

const buttonSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  url: z.string().optional(),
  phone_number: z.string().optional(),
});

const componentSchema = z.object({
  type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION']).optional(),
  text: z.string().optional(),
  buttons: z.array(buttonSchema).optional(),
  example: z.unknown().optional(),
});

export const templateComponentsSchema = z.array(componentSchema).min(1, 'inclua ao menos o BODY');

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'use apenas minúsculas, números e underscore'),
  language: z.string().min(2).max(10), // ex.: pt_BR
  category: z.enum(TEMPLATE_CATEGORIES),
  components: templateComponentsSchema,
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  components: templateComponentsSchema.optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const duplicateTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'use apenas minúsculas, números e underscore'),
  language: z.string().min(2).max(10).optional(),
});
export type DuplicateTemplateInput = z.infer<typeof duplicateTemplateSchema>;

/** Replicação em várias contas (Bulk Template Manager — spec §17, §52). */
export const replicateTemplateSchema = z.object({
  targetAccountIds: z.array(z.string().min(1)).min(1, 'selecione ao menos uma conta'),
});
export type ReplicateTemplateInput = z.infer<typeof replicateTemplateSchema>;
