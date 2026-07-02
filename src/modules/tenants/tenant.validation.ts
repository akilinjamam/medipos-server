import { z } from 'zod';
import { TENANT_CODE_REGEX } from './tenantCode';

export const createTenantSchema = z.object({
  name: z.string().min(1),
  // Optional vanity login code (e.g. "LAZZ-01"); auto-generated when omitted.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TENANT_CODE_REGEX, 'Code must be 3-15 letters, digits or dashes')
    .optional(),
  plan: z.enum(['silver', 'gold', 'platinum']).optional(),
  branchLimit: z.number().int().positive().optional(),
  userLimit: z.number().int().positive().optional(),
});

export const updateTenantSchema = createTenantSchema.partial().extend({
  subscriptionStatus: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional(),
  subscriptionExpiresAt: z.coerce.date().optional(),
});

export const updateBrandingSchema = z.object({
  businessName: z.string().max(120).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #0d9488')
    .optional(),
  addressLine: z.string().max(240).optional(),
  phone: z.string().max(40).optional(),
  invoiceFooter: z.string().max(280).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
