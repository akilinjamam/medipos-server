import { z } from 'zod';

/** Reusable Mongo ObjectId string validator. */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** Standard pagination query params, with sane defaults and caps. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Sort direction query param, shared across sortable list endpoints. */
export const sortDirSchema = z.enum(['asc', 'desc']).optional();
export type SortDir = z.infer<typeof sortDirSchema>;

/**
 * Build a Mongo sort spec from a (validated, allow-listed) `sortBy` field and
 * direction. Falls back to the module's default sort when no field is given, so
 * callers keep their existing ordering unless the client asks for something else.
 * `sortBy` must already be constrained to safe fields by a zod enum at the route.
 */
export function buildSort(
  sortBy: string | undefined,
  sortDir: SortDir,
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  if (!sortBy) return fallback;
  return { [sortBy]: sortDir === 'desc' ? -1 : 1 };
}
