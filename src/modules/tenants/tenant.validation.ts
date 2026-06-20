import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(1),
  plan: z.enum(['silver', 'gold', 'platinum']).optional(),
  branchLimit: z.number().int().positive().optional(),
  userLimit: z.number().int().positive().optional(),
});

export const updateTenantSchema = createTenantSchema.partial().extend({
  subscriptionStatus: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional(),
  subscriptionExpiresAt: z.coerce.date().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
