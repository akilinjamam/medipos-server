import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export interface SupplierDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  phone?: string;
  address?: string;
  /** Outstanding payable to this supplier (increased by purchases on credit). */
  dueBalance: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<SupplierDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    dueBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.plugin(tenantScopePlugin);

supplierSchema.index({ tenantId: 1, name: 1 });

export const Supplier = model<SupplierDoc>('Supplier', supplierSchema);
