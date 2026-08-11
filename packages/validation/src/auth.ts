import { z } from 'zod';

/**
 * Validação de entrada de autenticação (spec §47 — input validation via Zod).
 * A política de senha exige tamanho mínimo razoável; ajuste conforme requisitos
 * de compliance da organização.
 */
export const passwordSchema = z
  .string()
  .min(10, 'a senha deve ter ao menos 10 caracteres')
  .max(200);

export const signupSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(120).optional(),
  password: passwordSchema,
  /** Nome da primeira organização criada junto com a conta. */
  organizationName: z.string().min(2).max(120),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
