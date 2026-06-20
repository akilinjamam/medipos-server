import { FilterQuery, Types } from 'mongoose';
import { Batch, BatchDoc } from './batch.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import {
  CreateBatchInput,
  UpdateBatchInput,
  ListBatchesQuery,
  FefoQuery,
  NearExpiryQuery,
  LowStockQuery,
} from './batch.validation';

export interface FefoAllocationLine {
  batchId: string;
  batchNo: string;
  expiryDate: Date;
  sellPrice: number;
  quantity: number;
}

export interface FefoAllocation {
  productId: string;
  branchId: string;
  requested: number;
  allocated: number;
  fulfillable: boolean;
  lines: FefoAllocationLine[];
}

export interface LowStockRow {
  productId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  totalStock: number;
  reorderLevel: number;
  /** How far below the reorder level (reorderLevel - totalStock), ≥ 0. */
  shortfall: number;
}

/**
 * Batch (stock) management. Owns FEFO allocation planning and near-expiry
 * scanning (design doc rule #4, §10). Actual stock decrement on a sale happens
 * inside a transaction in the sales module — this module only plans.
 */
export const batchService = {
  async list(tenantId: string, query: ListBatchesQuery): Promise<BatchDoc[]> {
    const filter: FilterQuery<BatchDoc> = {};
    if (query.productId) filter.productId = query.productId;
    if (query.branchId) filter.branchId = query.branchId;
    if (query.inStock === true) filter.quantityInStock = { $gt: 0 };
    if (query.inStock === false) filter.quantityInStock = { $lte: 0 };

    return withTenant(Batch.find(filter), tenantId).sort({ expiryDate: 1 });
  },

  async getById(tenantId: string, id: string): Promise<BatchDoc> {
    const batch = await withTenant(Batch.findById(id), tenantId);
    if (!batch) throw ApiError.notFound('Batch not found');
    return batch;
  },

  /** Stock-in: register a new batch (or a fresh consignment of an existing one). */
  async create(tenantId: string, input: CreateBatchInput): Promise<BatchDoc> {
    try {
      return await Batch.create({ tenantId, ...input });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict('This batch number already exists for this product/branch');
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateBatchInput): Promise<BatchDoc> {
    const batch = await withTenant(
      Batch.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!batch) throw ApiError.notFound('Batch not found');
    return batch;
  },

  /** Hard delete — guarded to owner/manager (design doc §7). */
  async remove(tenantId: string, id: string): Promise<void> {
    const batch = await withTenant(Batch.findById(id), tenantId);
    if (!batch) throw ApiError.notFound('Batch not found');
    if (batch.quantityInStock > 0) {
      throw ApiError.badRequest('Cannot delete a batch that still has stock');
    }
    await withTenant(Batch.deleteOne({ _id: id }), tenantId);
  },

  /**
   * Plan a first-expiry-first-out allocation for a requested quantity. Does not
   * mutate stock — the sales transaction re-checks and decrements atomically.
   */
  async planFefo(tenantId: string, query: FefoQuery): Promise<FefoAllocation> {
    const batches = await withTenant(
      Batch.find({ productId: query.productId, branchId: query.branchId, quantityInStock: { $gt: 0 } }),
      tenantId,
    ).sort({ expiryDate: 1 });

    const lines: FefoAllocationLine[] = [];
    let remaining = query.quantity;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantityInStock, remaining);
      lines.push({
        batchId: String(batch._id),
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        sellPrice: batch.sellPrice,
        quantity: take,
      });
      remaining -= take;
    }

    const allocated = query.quantity - remaining;
    return {
      productId: query.productId,
      branchId: query.branchId,
      requested: query.quantity,
      allocated,
      fulfillable: remaining <= 0,
      lines,
    };
  },

  /** Near-expiry scan for dashboard alerts / SMS job (design doc §10). */
  async nearExpiry(tenantId: string, query: NearExpiryQuery): Promise<BatchDoc[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + query.withinDays);

    const filter: FilterQuery<BatchDoc> = {
      expiryDate: { $lte: cutoff },
      quantityInStock: { $gt: 0 },
    };
    if (query.branchId) filter.branchId = query.branchId;

    return withTenant(Batch.find(filter), tenantId).sort({ expiryDate: 1 });
  },

  /**
   * Low-stock scan (design doc §10): per product/branch, total on-hand stock
   * across batches against the product's `reorderLevel`. Drives reorder alerts
   * (dashboard flag + the daily SMS job). Aggregation is not auto tenant-scoped,
   * so `tenantId` is matched explicitly. Products with a `reorderLevel` of 0 are
   * excluded (no reorder threshold set); a product with no batches in a branch
   * is treated as not stocked there and won't appear.
   */
  async lowStock(tenantId: string, query: LowStockQuery): Promise<LowStockRow[]> {
    const match: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (query.branchId) match.branchId = new Types.ObjectId(query.branchId);

    return Batch.aggregate<LowStockRow>([
      { $match: match },
      {
        $group: {
          _id: { productId: '$productId', branchId: '$branchId' },
          totalStock: { $sum: '$quantityInStock' },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $match: {
          'product.isActive': true,
          'product.reorderLevel': { $gt: 0 },
          $expr: { $lte: ['$totalStock', '$product.reorderLevel'] },
        },
      },
      {
        $project: {
          _id: 0,
          productId: '$_id.productId',
          branchId: '$_id.branchId',
          name: '$product.name',
          totalStock: 1,
          reorderLevel: '$product.reorderLevel',
          shortfall: { $subtract: ['$product.reorderLevel', '$totalStock'] },
        },
      },
      { $sort: { shortfall: -1 } },
    ]);
  },
};
