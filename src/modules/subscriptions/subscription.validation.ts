import { z } from 'zod';

export const changePlanSchema = z.object({
  plan: z.enum(['silver', 'gold', 'platinum']),
});

/** Start a paid checkout for a plan (owner-initiated). */
export const initiatePaymentSchema = z.object({
  plan: z.enum(['silver', 'gold', 'platinum']),
});

/**
 * SSLCommerz IPN/webhook payload. We only type the fields we read; `passthrough`
 * keeps the rest (verify_key/verify_sign and the signed fields) so the gateway
 * can re-derive and check the signature. The transaction is then re-validated
 * server-side via `val_id` before any plan change is applied.
 */
export const webhookSchema = z
  .object({
    tran_id: z.string(),
    status: z.string().optional(),
    val_id: z.string().optional(),
    // App-supplied passthroughs: which tenant + plan the payment is for.
    value_a: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid tenantId'),
    value_b: z.string().optional(),
  })
  .passthrough();

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
