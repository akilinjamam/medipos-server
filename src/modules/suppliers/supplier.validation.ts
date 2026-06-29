import { z } from 'zod';
import { sortDirSchema } from '../../utils/validators';

/** Columns the suppliers list may be sorted by (allow-list — never raw input). */
export const SUPPLIER_SORT_FIELDS = ['name', 'dueBalance', 'createdAt'] as const;

export const listSuppliersQuerySchema = z.object({
  sortBy: z.enum(SUPPLIER_SORT_FIELDS).optional(),
  sortDir: sortDirSchema,
});

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  dueBalance: z.number().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Record a payment made to the supplier (reduces dueBalance).
export const settleDueSchema = z.object({
  amount: z.number().positive(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SettleDueInput = z.infer<typeof settleDueSchema>;
