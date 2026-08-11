import { z } from 'zod';

/** Paginação por cursor/limite (spec §36 filtros, listagens). */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const cuidSchema = z.string().min(1, 'id obrigatório');
