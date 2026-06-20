import { Types } from 'mongoose';
import { DailySummary, DailySummaryDoc } from './dailySummary.model';
import { Sale } from '../sales/sale.model';
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

    const costByBranch = new Map<string, number>(
      itemLevel.map((r) => [String(r._id), r.totalCost as number]),
    );

    for (const row of saleLevel) {
      const totalCost = costByBranch.get(String(row._id)) ?? 0;
      const grossProfit = row.totalRevenue - totalCost;
      await DailySummary.updateOne(
        { tenantId: tid, branchId: row._id, date: start },
        {
          $set: {
            transactionCount: row.transactionCount,
            totalRevenue: row.totalRevenue,
            totalCost,
            grossProfit,
            totalDue: row.totalDue,
          },
        },
        { upsert: true },
      );
    }

    return saleLevel.length;
  },
};
