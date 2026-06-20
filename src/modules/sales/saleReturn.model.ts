import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

/**
 * A return/refund against a finalized Sale (BACKEND_STATUS — Sales §6).
 * Restocks the returned batches, reverses the customer's due, and refunds the
 * remainder in cash. Each return is tenant-scoped and references its origin sale
 * so reports can reverse revenue/profit for the day it was processed.
 */
export interface SaleReturnItem {
  productId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNo: string;
  qty: number;
  /** Snapshots from the original sale line — refund is computed off these. */
  unitPrice: number;
  /** Discount prorated to the returned quantity (from the sale line). */
  discount: number;
  /** Cost snapshot from the original sale line — powers profit reversal. */
  costPrice: number;
}

export interface SaleReturnDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  saleId: Types.ObjectId;
  branchId: Types.ObjectId;
  customerId?: Types.ObjectId;
  /** Staff member who processed the return. */
  processedBy: Types.ObjectId;
  items: SaleReturnItem[];
  /** Net value returned (sum of line nets). */
  refundAmount: number;
  /** Portion applied against the customer's outstanding due on this sale. */
  dueReversed: number;
  /** Portion handed back as cash/transfer (refundAmount - dueReversed). */
  cashRefunded: number;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const saleReturnItemSchema = new Schema<SaleReturnItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNo: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const saleReturnSchema = new Schema<SaleReturnDoc>(
  {
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [saleReturnItemSchema], required: true },
    refundAmount: { type: Number, required: true, min: 0 },
    dueReversed: { type: Number, required: true, min: 0, default: 0 },
    cashRefunded: { type: Number, required: true, min: 0, default: 0 },
    reason: { type: String, trim: true },
  },
  { timestamps: true },
);

saleReturnSchema.plugin(tenantScopePlugin);

// All returns for a given sale (over-return checks + sale detail view).
saleReturnSchema.index({ tenantId: 1, saleId: 1 });
// Daily rollup reversal + branch return history.
saleReturnSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });

export const SaleReturn = model<SaleReturnDoc>('SaleReturn', saleReturnSchema);
