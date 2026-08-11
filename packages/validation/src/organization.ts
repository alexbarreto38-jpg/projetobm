import { z } from 'zod';

export const ROLE_VALUES = [
  'SUPER_ADMIN',
  'ORGANIZATION_ADMIN',
  'MANAGER',
  'OPERATOR',
  'VIEWER',
] as const;

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
  /** slug opcional; se ausente, derivado do nome no service. */
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'use apenas minúsculas, números e hífen')
    .optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(120).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ROLE_VALUES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLE_VALUES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
