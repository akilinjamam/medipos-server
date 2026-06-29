import { z } from 'zod';
import { objectId, paginationSchema, sortDirSchema } from '../../utils/validators';

/** Columns the sales list may be sorted by (allow-list — never raw input). */
export const SALE_SORT_FIELDS = ['createdAt', 'totalAmount', 'dueAmount'] as const;

const saleItemSchema = z.object({
  productId: objectId,
  batchId: objectId,
  qty: z.number().int().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).default(0),
});

export const createSaleSchema = z.object({
  branchId: objectId,
  customerId: objectId.optional(),
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.enum(['cash', 'bkash', 'nagad', 'card', 'due']),
  // Defaults to the full total (no due) when omitted.
  paidAmount: z.number().min(0).optional(),
});

// One queued offline sale: same as a normal sale plus its client UUID + timestamp.
export const offlineSaleSchema = createSaleSchema.extend({
  clientUuid: z.string().uuid(),
  createdAt: z.coerce.date().optional(),
});

export const bulkSyncSchema = z.object({
  sales: z.array(offlineSaleSchema).min(1).max(500),
});

export const listSalesQuerySchema = paginationSchema.extend({
  branchId: objectId.optional(),
  customerId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.enum(SALE_SORT_FIELDS).optional(),
  sortDir: sortDirSchema,
});

// One line of a return: which sale line (by batch) and how many units to give back.
const returnItemSchema = z.object({
  batchId: objectId,
  qty: z.number().int().positive(),
});

export const createReturnSchema = z.object({
  items: z.array(returnItemSchema).min(1),
  reason: z.string().max(500).optional(),
});

export const listReturnsQuerySchema = paginationSchema.extend({
  branchId: objectId.optional(),
  saleId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type OfflineSaleInput = z.infer<typeof offlineSaleSchema>;
export type BulkSyncInput = z.infer<typeof bulkSyncSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
