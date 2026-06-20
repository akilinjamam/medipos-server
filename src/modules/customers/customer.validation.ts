import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  dueBalance: z.number().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Record a customer payment against their outstanding due.
export const settleDueSchema = z.object({
  amount: z.number().positive(),
});

export const addPrescriptionSchema = z.object({
  date: z.coerce.date().optional(),
  doctorName: z.string().optional(),
  notes: z.string().optional(),
  fileKey: z.string().optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  hasDue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type SettleDueInput = z.infer<typeof settleDueSchema>;
export type AddPrescriptionInput = z.infer<typeof addPrescriptionSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
