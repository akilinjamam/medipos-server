import { FilterQuery } from 'mongoose';
import { SaleReturn, SaleReturnDoc, SaleReturnItem } from './saleReturn.model';
import { Sale } from './sale.model';
import { Batch } from '../batches/batch.model';
import { Customer } from '../customers/customer.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { withTransaction } from '../../db/withTransaction';
import { ApiError } from '../../utils/ApiError';
import { CreateReturnInput, ListReturnsQuery } from './sale.validation';

/** Round to 2 dp so prorated discounts don't accumulate float noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sales returns / refunds (BACKEND_STATUS — Sales §6). Processing a return
 * restocks the returned batches, reverses any outstanding customer due on the
 * sale, and refunds the remainder as cash — all in one transaction so stock and
 * the customer ledger never drift. Profit is reversed by the DailySummary
 * rebuild, which nets out returns processed on a given day.
 */
export const saleReturnService = {
  async list(tenantId: string, query: ListReturnsQuery): Promise<SaleReturnDoc[]> {
    const filter: FilterQuery<SaleReturnDoc> = {};
    if (query.branchId) filter.branchId = query.branchId;
    if (query.saleId) filter.saleId = query.saleId;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = query.from;
      if (query.to) filter.createdAt.$lte = query.to;
    }

    const skip = (query.page - 1) * query.limit;
    return withTenant(SaleReturn.find(filter), tenantId)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit);
  },

  async getById(tenantId: string, id: string): Promise<SaleReturnDoc> {
    const ret = await withTenant(SaleReturn.findById(id), tenantId);
    if (!ret) throw ApiError.notFound('Return not found');
    return ret;
  },

  /**
   * Record a return against a sale. Validates each returned line against the
   * remaining (un-returned) quantity, restocks the batch, and applies the
   * refund to outstanding due first, then cash.
   */
  async create(
    tenantId: string,
    processedBy: string,
    saleId: string,
    input: CreateReturnInput,
  ): Promise<SaleReturnDoc> {
    return withTransaction(async (session) => {
      const sale = await Sale.findOne({ _id: saleId, tenantId }).session(session);
      if (!sale) throw ApiError.notFound('Sale not found');

      // Match each returned line to its sale line by batch (one line per batch).
      const lineByBatch = new Map(sale.items.map((line) => [String(line.batchId), line]));

      const returnItems: SaleReturnItem[] = [];
      let refundAmount = 0;

      for (const reqItem of input.items) {
        const line = lineByBatch.get(reqItem.batchId);
        if (!line) {
          throw ApiError.badRequest(`Batch ${reqItem.batchId} is not part of this sale`);
        }

        const remaining = line.qty - line.returnedQty;
        if (reqItem.qty > remaining) {
          throw ApiError.badRequest(
            `Cannot return ${reqItem.qty} of batch ${line.batchNo}; only ${remaining} remain`,
          );
        }

        // Restock atomically. The batch must still exist (a depleted batch may
        // have been hard-deleted — we refuse rather than silently lose stock).
        const batch = await Batch.findOneAndUpdate(
          { _id: line.batchId, tenantId },
          { $inc: { quantityInStock: reqItem.qty } },
          { new: true, session },
        );
        if (!batch) {
          throw ApiError.badRequest(`Batch ${line.batchNo} no longer exists; cannot restock`);
        }

        // Prorate the line discount to the returned quantity.
        const proratedDiscount = round2(line.discount * (reqItem.qty / line.qty));
        refundAmount += reqItem.qty * line.unitPrice - proratedDiscount;

        line.returnedQty += reqItem.qty;
        returnItems.push({
          productId: line.productId,
          batchId: line.batchId,
          batchNo: line.batchNo,
          qty: reqItem.qty,
          unitPrice: line.unitPrice,
          discount: proratedDiscount,
          costPrice: line.costPrice,
        });
      }

      refundAmount = round2(refundAmount);

      // Reverse outstanding due on this sale first; refund the rest as cash.
      const prior = await SaleReturn.find({ tenantId, saleId }).session(session);
      const alreadyDueReversed = prior.reduce((s, r) => s + r.dueReversed, 0);
      const outstandingDue = Math.max(0, sale.dueAmount - alreadyDueReversed);
      const dueReversed = Math.min(refundAmount, outstandingDue);
      const cashRefunded = round2(refundAmount - dueReversed);

      if (dueReversed > 0 && sale.customerId) {
        await Customer.updateOne(
          { _id: sale.customerId, tenantId },
          { $inc: { dueBalance: -dueReversed } },
          { session },
        );
      }

      // Update the sale's aggregate return state.
      sale.refundedAmount = round2(sale.refundedAmount + refundAmount);
      const fullyReturned = sale.items.every((l) => l.returnedQty >= l.qty);
      const anyReturned = sale.items.some((l) => l.returnedQty > 0);
      sale.returnStatus = fullyReturned ? 'full' : anyReturned ? 'partial' : 'none';
      await sale.save({ session });

      const [saleReturn] = await SaleReturn.create(
        [
          {
            tenantId,
            saleId: sale._id,
            branchId: sale.branchId,
            customerId: sale.customerId,
            processedBy,
            items: returnItems,
            refundAmount,
            dueReversed,
            cashRefunded,
            reason: input.reason,
          },
        ],
        { session },
      );

      return saleReturn;
    });
  },
};
