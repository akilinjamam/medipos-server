import { z } from 'zod';

export const createApiTokenSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['owner', 'manager', 'cashier']).optional(),
  /** Optional lifetime in days; omit for a non-expiring token. */
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
