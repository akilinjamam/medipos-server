import { FilterQuery } from 'mongoose';
import { StockTransfer, StockTransferDoc } from './transfer.model';
import { Batch, BatchDoc } from '../batches/batch.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { withTransaction } from '../../db/withTransaction';
import { ApiError } from '../../utils/ApiError';
import { CreateTransferInput, ListTransfersQuery } from './transfer.validation';

export const transferService = {
  async list(tenantId: string, query: ListTransfersQuery): Promise<StockTransferDoc[]> {
    const filter: FilterQuery<StockTransferDoc> = {};
    if (query.productId) filter.productId = query.productId;
    // A branch filter matches transfers in or out of that branch.
    if (query.branchId) {
      filter.$or = [{ fromBranchId: query.branchId }, { toBranchId: query.branchId }];
    }
    return withTenant(StockTransfer.find(filter), tenantId).sort({ createdAt: -1 });
  },

  /**
   * Move `qty` units of a batch to another branch, atomically (design doc §12).
   * The source batch is decremented with the same atomic stock guard used at
   * sale finalization (never move more than is on hand), and the destination
   * branch's matching batch is created or topped up — preserving batchNo,
   * expiry, and pricing so FEFO and profit reporting stay correct.
   */
  async create(
    tenantId: string,
    performedBy: string,
    input: CreateTransferInput,
  ): Promise<StockTransferDoc> {
    return withTransaction(async (session) => {
      const source = await Batch.findOne({ _id: input.batchId, tenantId }).session(session);
      if (!source) throw ApiError.notFound('Source batch not found');

      if (String(source.branchId) === input.toBranchId) {
        throw ApiError.badRequest('Source and destination branches must differ');
      }

      // Atomic guard: only moves stock if the source batch has enough on hand.
      const decremented = await Batch.findOneAndUpdate(
        { _id: source._id, tenantId, quantityInStock: { $gte: input.qty } },
        { $inc: { quantityInStock: -input.qty } },
        { new: true, session },
      );
      if (!decremented) throw ApiError.conflict('Insufficient stock in the source batch');

      // Create or top up the matching batch in the destination branch.
      const dest = (await Batch.findOneAndUpdate(
        {
          tenantId,
          productId: source.productId,
          branchId: input.toBranchId,
          batchNo: source.batchNo,
        },
        {
          $inc: { quantityInStock: input.qty },
          $setOnInsert: {
            tenantId,
            productId: source.productId,
            branchId: input.toBranchId,
            batchNo: source.batchNo,
            expiryDate: source.expiryDate,
            costPrice: source.costPrice,
            sellPrice: source.sellPrice,
            supplierId: source.supplierId,
            purchaseDate: source.purchaseDate,
          },
        },
        { new: true, upsert: true, session },
      )) as BatchDoc;

      const [transfer] = await StockTransfer.create(
        [
          {
            tenantId,
            productId: source.productId,
            fromBranchId: source.branchId,
            toBranchId: input.toBranchId,
            fromBatchId: source._id,
            toBatchId: dest._id,
            batchNo: source.batchNo,
            expiryDate: source.expiryDate,
            qty: input.qty,
            performedBy,
            note: input.note,
          },
        ],
        { session },
      );

      return transfer;
    });
  },
};
