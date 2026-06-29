import { z } from 'zod';
import { objectId, sortDirSchema } from '../../utils/validators';

/** Columns the purchases list may be sorted by (allow-list — never raw input). */
export const PURCHASE_SORT_FIELDS = ['createdAt', 'totalAmount'] as const;

const purchaseItemSchema = z.object({
  productId: objectId,
  batchNo: z.string().min(1),
  qty: z.number().int().positive(),
  costPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  expiryDate: z.coerce.date(),
});

export const createPurchaseSchema = z.object({
  branchId: objectId,
  supplierId: objectId,
  items: z.array(purchaseItemSchema).min(1),
  amountPaid: z.number().min(0).default(0),
});

export const listPurchasesQuerySchema = z.object({
  branchId: objectId.optional(),
  supplierId: objectId.optional(),
  status: z.enum(['pending', 'received', 'cancelled']).optional(),
  sortBy: z.enum(PURCHASE_SORT_FIELDS).optional(),
  sortDir: sortDirSchema,
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
