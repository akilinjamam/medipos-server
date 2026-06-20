import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(['owner', 'manager', 'cashier']).default('cashier'),
  branchId: objectId.optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  // Password reset is allowed via update; omitted keeps the existing one.
  password: z.string().min(6).optional(),
  role: z.enum(['owner', 'manager', 'cashier']).optional(),
  branchId: objectId.optional(),
  isActive: z.boolean().optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.enum(['owner', 'manager', 'cashier']).optional(),
  branchId: objectId.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
