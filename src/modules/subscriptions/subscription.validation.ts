import { z } from 'zod';

export const changePlanSchema = z.object({
  plan: z.enum(['silver', 'gold', 'platinum']),
});

/**
 * SSLCommerz IPN/webhook payload (subset). In production, validate the
 * transaction against SSLCommerz's validation API before trusting it.
 */
export const webhookSchema = z.object({
  tran_id: z.string(),
  status: z.string(),
  // App-supplied passthrough that carries which tenant the payment is for.
  value_a: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid tenantId'),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
