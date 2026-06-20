import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export type PurchaseStatus = 'pending' | 'received' | 'cancelled';
export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseItem {
  productId: Types.ObjectId;
  batchNo: string;
  qty: number;
  costPrice: number;
  sellPrice: number;
  expiryDate: Date;
}

export interface PurchaseDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  supplierId: Types.ObjectId;
  items: PurchaseItem[];
  totalAmount: number;
  amountPaid: number;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseItemSchema = new Schema<PurchaseItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchNo: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    costPrice: { type: Number, required: true, min: 0 },
    sellPrice: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
  },
  { _id: false },
);

const purchaseSchema = new Schema<PurchaseDoc>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: { type: [purchaseItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['pending', 'received', 'cancelled'], default: 'pending' },
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    receivedAt: { type: Date },
  },
  { timestamps: true },
);

purchaseSchema.plugin(tenantScopePlugin);

purchaseSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
purchaseSchema.index({ tenantId: 1, supplierId: 1, status: 1 });

export const Purchase = model<PurchaseDoc>('Purchase', purchaseSchema);
