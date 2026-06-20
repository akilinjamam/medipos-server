import { z } from 'zod';
import { objectId } from '../../utils/validators';

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
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
