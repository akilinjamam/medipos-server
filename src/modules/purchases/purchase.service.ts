import { FilterQuery } from 'mongoose';
import { Purchase, PurchaseDoc } from './purchase.model';
import { Batch } from '../batches/batch.model';
import { Supplier } from '../suppliers/supplier.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { withTransaction } from '../../db/withTransaction';
import { ApiError } from '../../utils/ApiError';
import { buildSort } from '../../utils/validators';
import { CreatePurchaseInput, ListPurchasesQuery } from './purchase.validation';

function paymentStatusFor(total: number, paid: number): PurchaseDoc['paymentStatus'] {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

/**
 * Purchase orders & goods receipt (design doc §6). Receiving a PO creates/tops
 * up the relevant batches and increases the supplier's due — done atomically in
 * a transaction so stock and ledger never drift apart.
 */
export const purchaseService = {
  async list(tenantId: string, query: ListPurchasesQuery): Promise<PurchaseDoc[]> {
    const filter: FilterQuery<PurchaseDoc> = {};
    if (query.branchId) filter.branchId = query.branchId;
    if (query.supplierId) filter.supplierId = query.supplierId;
    if (query.status) filter.status = query.status;

    const sort = buildSort(query.sortBy, query.sortDir, { createdAt: -1 });
    return withTenant(Purchase.find(filter), tenantId).sort(sort);
  },

  async getById(tenantId: string, id: string): Promise<PurchaseDoc> {
    const purchase = await withTenant(Purchase.findById(id), tenantId);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    return purchase;
  },

  async create(tenantId: string, input: CreatePurchaseInput): Promise<PurchaseDoc> {
    const totalAmount = input.items.reduce((sum, it) => sum + it.costPrice * it.qty, 0);
    if (input.amountPaid > totalAmount) {
      throw ApiError.badRequest('amountPaid cannot exceed the purchase total');
    }

    return Purchase.create({
      tenantId,
      branchId: input.branchId,
      supplierId: input.supplierId,
      items: input.items,
      totalAmount,
      amountPaid: input.amountPaid,
      paymentStatus: paymentStatusFor(totalAmount, input.amountPaid),
      status: 'pending',
    });
  },

  /**
   * Goods receipt: move a pending PO to `received`, create/top-up batches, and
   * add the unpaid balance to the supplier's due — all in one transaction.
   */
  async receive(tenantId: string, id: string): Promise<PurchaseDoc> {
    return withTransaction(async (session) => {
      const purchase = await Purchase.findOne({ _id: id, tenantId }).session(session);
      if (!purchase) throw ApiError.notFound('Purchase not found');
      if (purchase.status !== 'pending') {
        throw ApiError.badRequest(`Purchase already ${purchase.status}`);
      }

      for (const item of purchase.items) {
        // Top up an existing batch (same product/branch/batchNo) or create one.
        const existing = await Batch.findOne({
          tenantId,
          productId: item.productId,
          branchId: purchase.branchId,
          batchNo: item.batchNo,
        }).session(session);

        if (existing) {
          existing.quantityInStock += item.qty;
          existing.costPrice = item.costPrice;
          existing.sellPrice = item.sellPrice;
          existing.expiryDate = item.expiryDate;
          await existing.save({ session });
        } else {
          await Batch.create(
            [
              {
                tenantId,
                productId: item.productId,
                branchId: purchase.branchId,
                batchNo: item.batchNo,
                expiryDate: item.expiryDate,
                costPrice: item.costPrice,
                sellPrice: item.sellPrice,
                quantityInStock: item.qty,
                supplierId: purchase.supplierId,
                purchaseDate: new Date(),
              },
            ],
            { session },
          );
        }
      }

      const due = purchase.totalAmount - purchase.amountPaid;
      if (due > 0) {
        await Supplier.updateOne(
          { _id: purchase.supplierId, tenantId },
          { $inc: { dueBalance: due } },
          { session },
        );
      }

      purchase.status = 'received';
      purchase.receivedAt = new Date();
      await purchase.save({ session });

      return purchase;
    });
  },

  async cancel(tenantId: string, id: string): Promise<PurchaseDoc> {
    const purchase = await withTenant(Purchase.findById(id), tenantId);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.status === 'received') {
      throw ApiError.badRequest('Cannot cancel a received purchase');
    }
    purchase.status = 'cancelled';
    await purchase.save();
    return purchase;
  },
};
