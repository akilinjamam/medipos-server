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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
