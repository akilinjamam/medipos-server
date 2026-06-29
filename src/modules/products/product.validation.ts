import { z } from 'zod';
import { paginationSchema, sortDirSchema } from '../../utils/validators';

/** Columns the products list may be sorted by (allow-list — never raw input). */
export const PRODUCT_SORT_FIELDS = ['name', 'category', 'reorderLevel', 'createdAt'] as const;

export const createProductSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  dosageForm: z.string().optional(),
  strength: z.string().optional(),
  category: z.enum(['OTC', 'Rx', 'Controlled']).default('OTC'),
  unit: z.string().optional(),
  unitsPerBox: z.number().int().positive().optional(),
  barcode: z.string().optional(),
  reorderLevel: z.number().int().min(0).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listProductsQuerySchema = paginationSchema.extend({
  // Free-text search across name / generic / brand / barcode.
  search: z.string().trim().optional(),
  category: z.enum(['OTC', 'Rx', 'Controlled']).optional(),
  sortBy: z.enum(PRODUCT_SORT_FIELDS).optional(),
  sortDir: sortDirSchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
