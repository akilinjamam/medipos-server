import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const registerSchema = z.object({
  tenantId: objectId,
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(['owner', 'manager', 'cashier']).optional(),
  branchId: objectId.optional(),
});

export const loginSchema = z.object({
  // Phone is unique per tenant, so login is scoped by tenant (design doc §3).
  tenantId: objectId,
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
