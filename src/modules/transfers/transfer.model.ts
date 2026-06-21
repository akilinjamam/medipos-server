import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

/**
 * Cross-branch stock transfer (design doc §12 — Platinum). An immutable record
 * of moving `qty` units of a batch from one branch to another. The actual stock
 * movement (decrement source batch, increment/create destination batch) happens
 * atomically in a transaction in the service; this document is the audit trail.
 */
export interface StockTransferDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  productId: Types.ObjectId;
  fromBranchId: Types.ObjectId;
  toBranchId: Types.ObjectId;
  fromBatchId: Types.ObjectId;
  toBatchId: Types.ObjectId;
  batchNo: string;
  expiryDate: Date;
  qty: number;
  performedBy: Types.ObjectId;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockTransferSchema = new Schema<StockTransferDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    fromBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    toBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNo: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    qty: { type: Number, required: true, min: 1 },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

stockTransferSchema.plugin(tenantScopePlugin);

// Transfer history, most recent first.
stockTransferSchema.index({ tenantId: 1, createdAt: -1 });
// Filter by either branch involved.
stockTransferSchema.index({ tenantId: 1, fromBranchId: 1, toBranchId: 1 });

export const StockTransfer = model<StockTransferDoc>('StockTransfer', stockTransferSchema);
