import { Schema, model, Document, Types } from 'mongoose';
import { Plan } from '../../config/planFeatures';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface TenantDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: Date;
  branchLimit: number;
  userLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<TenantDoc>(
  {
    name: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['silver', 'gold', 'platinum'], default: 'silver' },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'trialing'],
      default: 'trialing',
    },
    subscriptionExpiresAt: { type: Date },
    branchLimit: { type: Number, default: 1 },
    userLimit: { type: Number, default: 3 },
  },
  { timestamps: true },
);

// Global collection — intentionally NOT tenant-scoped.
export const Tenant = model<TenantDoc>('Tenant', tenantSchema);
