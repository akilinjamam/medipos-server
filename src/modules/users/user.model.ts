import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  branchId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // Never returned by default — must be explicitly selected for auth.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'manager', 'cashier'], default: 'cashier' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.plugin(tenantScopePlugin);

// Phone unique per tenant; compound index leads with tenantId (design doc §3).
userSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export const User = model<UserDoc>('User', userSchema);
