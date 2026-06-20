import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

/**
 * Pre-aggregated daily rollup (design doc §11). A nightly job writes one doc
 * per tenant/branch/day so the dashboard never computes profit/loss live from
 * raw sale line-items.
 */
export interface DailySummaryDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  /** Midnight (UTC) of the summarized day. */
  date: Date;
  transactionCount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalDue: number;
  createdAt: Date;
  updatedAt: Date;
}

const dailySummarySchema = new Schema<DailySummaryDoc>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    date: { type: Date, required: true },
    transactionCount: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    grossProfit: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
  },
  { timestamps: true },
);

dailySummarySchema.plugin(tenantScopePlugin);

// One summary per branch per day; also the range-query index for reports.
dailySummarySchema.index({ tenantId: 1, branchId: 1, date: 1 }, { unique: true });

export const DailySummary = model<DailySummaryDoc>('DailySummary', dailySummarySchema);
