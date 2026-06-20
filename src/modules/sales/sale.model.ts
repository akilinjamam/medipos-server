import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'card' | 'due';

export interface SaleItem {
  productId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNo: string;
  qty: number;
  unitPrice: number;
  discount: number;
  /** Cost snapshot at sale time (from the batch) — powers profit reports. */
  costPrice: number;
  /** How much of this line has been returned/refunded so far (≤ qty). */
  returnedQty: number;
}

/** Lifecycle of a sale with respect to returns. */
export type ReturnStatus = 'none' | 'partial' | 'full';

export interface SaleDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  cashierId: Types.ObjectId;
  customerId?: Types.ObjectId;
  items: SaleItem[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: PaymentMethod;
  /** Return lifecycle + total value refunded across all returns of this sale. */
  returnStatus: ReturnStatus;
  refundedAmount: number;
  /** True when this sale originated offline and arrived via bulk-sync (§9). */
  syncedFromOffline: boolean;
  /** Client-generated UUID for offline sales — makes sync idempotent (§9). */
  clientUuid?: string;
  createdAt: Date;
  updatedAt: Date;
}

const saleItemSchema = new Schema<SaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNo: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    returnedQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const saleSchema = new Schema<SaleDoc>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    items: { type: [saleItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bkash', 'nagad', 'card', 'due'],
      required: true,
    },
    returnStatus: { type: String, enum: ['none', 'partial', 'full'], default: 'none' },
    refundedAmount: { type: Number, default: 0, min: 0 },
    syncedFromOffline: { type: Boolean, default: false },
    clientUuid: { type: String },
  },
  { timestamps: true },
);

saleSchema.plugin(tenantScopePlugin);

// Sales history / reporting by branch over time.
saleSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
// Idempotent offline sync: a client UUID maps to at most one sale per tenant.
saleSchema.index({ tenantId: 1, clientUuid: 1 }, { unique: true, sparse: true });

export const Sale = model<SaleDoc>('Sale', saleSchema);
