import { Types } from 'mongoose';
import { DailySummary, DailySummaryDoc } from './dailySummary.model';
import { Sale } from '../sales/sale.model';
import { SaleReturn } from '../sales/saleReturn.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { batchService } from '../batches/batch.service';
import { Tenant } from '../tenants/tenant.model';
import { Customer } from '../customers/customer.model';
import { Supplier } from '../suppliers/supplier.model';
import { cached, cacheDelByPrefix, tenantCacheKey, tenantCachePrefix } from '../../utils/cache';
import { generateReportPdf } from '../../utils/pdf';
import { uploadBuffer, StoredObject } from '../../config/storage';
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
  /**
   * Sales + profit/loss over a date range, served from DailySummary. Cached
   * per tenant+range+branch (read-through); the cache is dropped whenever the
   * underlying summaries are rebuilt (see `rebuildDailySummary`).
   */
  async salesReport(tenantId: string, query: DateRangeQuery): Promise<SalesReport> {
    const from = startOfUtcDay(query.from);
    const to = startOfUtcDay(query.to);
    const key = tenantCacheKey(
      tenantId,
      'salesReport',
      from.getTime(),
      to.getTime(),
      query.branchId ?? 'all',
    );
    return cached(key, () => this.computeSalesReport(tenantId, from, to, query.branchId));
  },

  async computeSalesReport(
    tenantId: string,
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<SalesReport> {
    const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
    if (branchId) filter.branchId = branchId;

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

  /**
   * Fast/slow movers — live aggregation over sales in the range. Cached per
   * tenant+range+branch+order+limit; entries are short-lived (default TTL) and
   * cleared with the rest of the tenant's report cache on summary rebuild.
   */
  async movers(tenantId: string, query: MoversQuery) {
    const key = tenantCacheKey(
      tenantId,
      'movers',
      query.from.getTime(),
      query.to.getTime(),
      query.branchId ?? 'all',
      query.order,
      query.limit,
    );
    return cached(key, () => this.computeMovers(tenantId, query));
  },

  async computeMovers(tenantId: string, query: MoversQuery) {
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

  /**
   * Export the sales/profit report as a PDF and store it (design doc §11).
   * Reuses the cached `salesReport` numbers (no raw re-scan); uploads to S3 when
   * configured, else local disk. Branding is applied when the tenant has it.
   */
  async salesReportPdf(tenantId: string, query: DateRangeQuery): Promise<StoredObject> {
    const report = await this.salesReport(tenantId, query);
    const tenant = await Tenant.findById(tenantId).select('name branding').lean();

    const pdf = await generateReportPdf({
      title: 'Sales & Profit Report',
      tenantName: tenant?.name ?? 'MediPOS',
      branding: tenant?.branding,
      from: report.from,
      to: report.to,
      rows: report.days.map((d) => ({
        date: d.date,
        revenue: d.totalRevenue,
        cost: d.totalCost,
        profit: d.grossProfit,
        due: d.totalDue,
        transactions: d.transactionCount,
      })),
      totals: {
        revenue: report.totalRevenue,
        cost: report.totalCost,
        profit: report.grossProfit,
        due: report.totalDue,
        transactions: report.transactionCount,
      },
    });

    const from = report.from.toISOString().slice(0, 10);
    const to = report.to.toISOString().slice(0, 10);
    return uploadBuffer(`reports/${tenantId}/sales-${from}_${to}.pdf`, pdf, 'application/pdf');
  },

  /** Near-expiry stock report (delegates to the batch service). */
  async expiry(tenantId: string, query: ExpiryQuery) {
    return batchService.nearExpiry(tenantId, {
      branchId: query.branchId,
      withinDays: query.withinDays,
    });
  },

  /**
   * BI dashboard summary (design doc §12): a single payload of headline KPIs for
   * the last 30 days — sales/profit totals (from DailySummary), top movers,
   * low-stock & near-expiry counts, and outstanding receivables/payables.
   * Cached per tenant and cleared with the rest of the report cache on rebuild.
   */
  async dashboard(tenantId: string) {
    return cached(tenantCacheKey(tenantId, 'dashboard'), () => this.computeDashboard(tenantId));
  },

  async computeDashboard(tenantId: string) {
    const to = new Date();
    const from = addDays(startOfUtcDay(to), -29);

    const sales = await this.salesReport(tenantId, { from, to });
    const [lowStock, nearExpiry, topMovers, receivables, payables] = await Promise.all([
      batchService.lowStock(tenantId, {}),
      batchService.nearExpiry(tenantId, { withinDays: 90 }),
      this.movers(tenantId, { from, to, limit: 5, order: 'fast' }),
      sumDueBalance(Customer, tenantId),
      sumDueBalance(Supplier, tenantId),
    ]);

    return {
      period: { from, to },
      totals: {
        revenue: sales.totalRevenue,
        cost: sales.totalCost,
        grossProfit: sales.grossProfit,
        due: sales.totalDue,
        transactions: sales.transactionCount,
      },
      lowStockCount: lowStock.length,
      nearExpiryCount: nearExpiry.length,
      topMovers,
      outstandingReceivable: receivables,
      outstandingPayable: payables,
    };
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

    // Summaries changed — drop this tenant's cached report reads.
    await cacheDelByPrefix(tenantCachePrefix(tenantId));

    return byBranch.size;
  },
};

/** Sum of `dueBalance` across a tenant's docs (Customer receivable / Supplier payable). */
async function sumDueBalance(
  Model: typeof Customer | typeof Supplier,
  tenantId: string,
): Promise<number> {
  const [row] = await Model.aggregate<{ total: number }>([
    { $match: { tenantId: new Types.ObjectId(tenantId) } },
    { $group: { _id: null, total: { $sum: '$dueBalance' } } },
  ]);
  return row?.total ?? 0;
}
