import { Types } from 'mongoose';
import { DailySummary, DailySummaryDoc } from './dailySummary.model';
import { Sale } from '../sales/sale.model';
import { SaleReturn } from '../sales/saleReturn.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { batchService } from '../batches/batch.service';
import { DateRangeQuery, MoversQuery, ExpiryQuery } from './report.validation';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

export interface SalesReport {
  from: Date;
  to: Date;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalDue: number;
  transactionCount: number;
  days: DailySummaryDoc[];
}

/**
 * Reports read from the pre-aggregated `DailySummary` collection (design doc
 * §11) rather than scanning raw sales — except live operational lists (movers,
 * expiry) which are inherently current-state.
 */
export const reportService = {
  /** Sales + profit/loss over a date range, served from DailySummary. */
  async salesReport(tenantId: string, query: DateRangeQuery): Promise<SalesReport> {
    const from = startOfUtcDay(query.from);
    const to = startOfUtcDay(query.to);

    const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
    if (query.branchId) filter.branchId = query.branchId;

    const days = await withTenant(DailySummary.find(filter), tenantId).sort({ date: 1 });

    const totals = days.reduce(
      (acc, d) => {
        acc.totalRevenue += d.totalRevenue;
        acc.totalCost += d.totalCost;
        acc.grossProfit += d.grossProfit;
        acc.totalDue += d.totalDue;
        acc.transactionCount += d.transactionCount;
        return acc;
      },
      { totalRevenue: 0, totalCost: 0, grossProfit: 0, totalDue: 0, transactionCount: 0 },
    );

    return { from, to, ...totals, days };
  },

  /** Fast/slow movers — live aggregation over sales in the range. */
  async movers(tenantId: string, query: MoversQuery) {
    const rows = await Sale.aggregate([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          createdAt: { $gte: query.from, $lte: query.to },
          ...(query.branchId ? { branchId: new Types.ObjectId(query.branchId) } : {}),
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          unitsSold: { $sum: '$items.qty' },
          revenue: {
            $sum: {
              $subtract: [{ $multiply: ['$items.unitPrice', '$items.qty'] }, '$items.discount'],
            },
          },
        },
      },
      { $sort: { unitsSold: query.order === 'fast' ? -1 : 1 } },
      { $limit: query.limit },
      {
        $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$product.name',
          unitsSold: 1,
          revenue: 1,
        },
      },
    ]);

    return rows;
  },

  /** Near-expiry stock report (delegates to the batch service). */
  async expiry(tenantId: string, query: ExpiryQuery) {
    return batchService.nearExpiry(tenantId, {
      branchId: query.branchId,
      withinDays: query.withinDays,
    });
  },

  /**
   * Rebuild the DailySummary rows for a single day (the nightly cron job's
   * unit of work; also exposed for manual backfill). Upserts one doc per branch.
   *
   * Returns processed on the day are netted out — refunded revenue, cost, and
   * reversed due are subtracted — so profit/loss reflects refunds. A branch with
   * only returns (for sales from an earlier day) still gets a row with the
   * negative adjustment.
   */
  async rebuildDailySummary(tenantId: string, date: Date): Promise<number> {
    const start = startOfUtcDay(date);
    const end = addDays(start, 1);
    const tid = new Types.ObjectId(tenantId);
    const match = { tenantId: tid, createdAt: { $gte: start, $lt: end } };

    // Per-sale totals (revenue & due come straight off the sale).
    const saleLevel = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$branchId',
          totalRevenue: { $sum: '$totalAmount' },
          totalDue: { $sum: '$dueAmount' },
          transactionCount: { $sum: 1 },
        },
      },
    ]);

    // Per-item cost (needs the line items).
    const itemLevel = await Sale.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$branchId',
          totalCost: { $sum: { $multiply: ['$items.costPrice', '$items.qty'] } },
        },
      },
    ]);

    // Returns processed this day: refunded revenue + reversed due per branch.
    const returnLevel = await SaleReturn.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$branchId',
          returnedRevenue: { $sum: '$refundAmount' },
          returnedDue: { $sum: '$dueReversed' },
        },
      },
    ]);

    // Cost of returned goods per branch (needs the return line items).
    const returnItemLevel = await SaleReturn.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$branchId',
          returnedCost: { $sum: { $multiply: ['$items.costPrice', '$items.qty'] } },
        },
      },
    ]);

    interface Bucket {
      transactionCount: number;
      totalRevenue: number;
      totalCost: number;
      totalDue: number;
    }
    const byBranch = new Map<string, Bucket>();
    const bucket = (id: unknown): Bucket => {
      const key = String(id);
      let b = byBranch.get(key);
      if (!b) {
        b = { transactionCount: 0, totalRevenue: 0, totalCost: 0, totalDue: 0 };
        byBranch.set(key, b);
      }
      return b;
    };

    for (const r of saleLevel) {
      const b = bucket(r._id);
      b.transactionCount += r.transactionCount;
      b.totalRevenue += r.totalRevenue;
      b.totalDue += r.totalDue;
    }
    for (const r of itemLevel) bucket(r._id).totalCost += r.totalCost;
    for (const r of returnLevel) {
      const b = bucket(r._id);
      b.totalRevenue -= r.returnedRevenue;
      b.totalDue -= r.returnedDue;
    }
    for (const r of returnItemLevel) bucket(r._id).totalCost -= r.returnedCost;

    for (const [branchId, t] of byBranch) {
      const grossProfit = t.totalRevenue - t.totalCost;
      await DailySummary.updateOne(
        { tenantId: tid, branchId: new Types.ObjectId(branchId), date: start },
        {
          $set: {
            transactionCount: t.transactionCount,
            totalRevenue: t.totalRevenue,
            totalCost: t.totalCost,
            grossProfit,
            totalDue: t.totalDue,
          },
        },
        { upsert: true },
      );
    }

    return byBranch.size;
  },
};
