import { z } from 'zod';

export const expiryAlertSchema = z.object({
  managerPhone: z.string().min(3),
  withinDays: z.number().int().positive().max(365).default(30),
});

export type ExpiryAlertInput = z.infer<typeof expiryAlertSchema>;
