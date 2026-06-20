import { z } from 'zod';

/** Reusable Mongo ObjectId string validator. */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** Standard pagination query params, with sane defaults and caps. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
