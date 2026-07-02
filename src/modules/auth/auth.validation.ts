import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * What the user types to identify their pharmacy: the human-friendly tenant
 * code (e.g. "MP-4K7TQ2") or, for backward compatibility, the raw ObjectId.
 * `tenantService.resolveByCodeOrId` maps it to the real `_id`. Codes max out
 * at 15 chars, so a 24-hex ObjectId is never ambiguous.
 */
const tenantIdentifier = z.string().trim().min(3, 'Tenant code is required');

export const registerSchema = z.object({
  tenantId: tenantIdentifier,
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(['owner', 'manager', 'cashier']).optional(),
  branchId: objectId.optional(),
});

export const loginSchema = z.object({
  // Phone is unique per tenant, so login is scoped by tenant (design doc §3).
  tenantId: tenantIdentifier,
  phone: z.string().min(3),
  password: z.string().min(1),
});

/**
 * Self-service profile edit (PATCH /auth/me). A user may change their own
 * display name and email only — never their role, branch or phone (the login
 * identifier). An empty-string email clears the field.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
  })
  .refine((d) => d.name !== undefined || d.email !== undefined, {
    message: 'Provide a name or email to update',
  });

/** Self-service password change (POST /auth/change-password). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
