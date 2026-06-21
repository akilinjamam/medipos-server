import { z } from 'zod';
import { objectId } from '../../utils/validators';

export const createTransferSchema = z.object({
  /** Source batch to move stock out of (its branch is the origin). */
  batchId: objectId,
  /** Destination branch. */
  toBranchId: objectId,
  qty: z.number().int().positive(),
  note: z.string().optional(),
});

export const listTransfersSchema = z.object({
  branchId: objectId.optional(),
  productId: objectId.optional(),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type ListTransfersQuery = z.infer<typeof listTransfersSchema>;
