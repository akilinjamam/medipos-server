import { z } from 'zod';
import { objectId } from '../../utils/validators';

export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  branchId: objectId.optional(),
});

export const moversQuerySchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
  order: z.enum(['fast', 'slow']).default('fast'),
});

export const expiryQuerySchema = z.object({
  branchId: objectId.optional(),
  withinDays: z.coerce.number().int().positive().max(365).default(90),
});

// Manual rebuild of a single day's summary (normally a nightly cron job).
export const rebuildSchema = z.object({
  date: z.coerce.date().optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type MoversQuery = z.infer<typeof moversQuerySchema>;
export type ExpiryQuery = z.infer<typeof expiryQuerySchema>;
export type RebuildInput = z.infer<typeof rebuildSchema>;
