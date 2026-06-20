import { z } from 'zod';
import { objectId } from '../../utils/validators';

export const createBatchSchema = z.object({
  productId: objectId,
  branchId: objectId,
  batchNo: z.string().min(1),
  expiryDate: z.coerce.date(),
  costPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  quantityInStock: z.number().int().min(0).default(0),
  supplierId: objectId.optional(),
  purchaseDate: z.coerce.date().optional(),
});

// Stock-in adjusts quantity and prices; product/branch/batchNo are immutable.
export const updateBatchSchema = z.object({
  expiryDate: z.coerce.date().optional(),
  costPrice: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
  quantityInStock: z.number().int().min(0).optional(),
});

export const listBatchesQuerySchema = z.object({
  productId: objectId.optional(),
  branchId: objectId.optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const fefoQuerySchema = z.object({
  productId: objectId,
  branchId: objectId,
  quantity: z.coerce.number().int().positive(),
});

export const nearExpiryQuerySchema = z.object({
  branchId: objectId.optional(),
  withinDays: z.coerce.number().int().positive().max(365).default(30),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type FefoQuery = z.infer<typeof fefoQuerySchema>;
export type NearExpiryQuery = z.infer<typeof nearExpiryQuerySchema>;
