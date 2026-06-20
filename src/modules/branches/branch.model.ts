import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export interface BranchDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  address?: string;
  phone?: string;
  isMainBranch: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const branchSchema = new Schema<BranchDoc>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    isMainBranch: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

branchSchema.plugin(tenantScopePlugin);

branchSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Branch = model<BranchDoc>('Branch', branchSchema);
