import { z } from 'zod';

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

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SettleDueInput = z.infer<typeof settleDueSchema>;
