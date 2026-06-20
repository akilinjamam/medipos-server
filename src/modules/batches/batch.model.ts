import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

/**
 * Batch is core, not optional (design doc rule #4). Pharmacy stock is tracked
 * per batch so FEFO (first-expiry-first-out) and near-expiry alerts work.
 */
export interface BatchDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  productId: Types.ObjectId;
  branchId: Types.ObjectId;
  batchNo: string;
  expiryDate: Date;
  costPrice: number;
  sellPrice: number;
  quantityInStock: number;
  supplierId?: Types.ObjectId;
  purchaseDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<BatchDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    batchNo: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true },
    costPrice: { type: Number, required: true, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    quantityInStock: { type: Number, required: true, min: 0, default: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseDate: { type: Date },
  },
  { timestamps: true },
);

batchSchema.plugin(tenantScopePlugin);

// Near-expiry scan + FEFO ordering rely on this compound index (design doc §5).
batchSchema.index({ tenantId: 1, branchId: 1, expiryDate: 1 });
// Stock lookup for a product within a branch (FEFO allocation).
batchSchema.index({ tenantId: 1, productId: 1, branchId: 1, expiryDate: 1 });
// A batch number is unique per product per branch.
batchSchema.index({ tenantId: 1, productId: 1, branchId: 1, batchNo: 1 }, { unique: true });

export const Batch = model<BatchDoc>('Batch', batchSchema);
