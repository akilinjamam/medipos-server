import { Schema, model, Document, Types } from 'mongoose';
import { Plan } from '../../config/planFeatures';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

/** White-label branding (design doc §12 — Platinum) applied to invoices/reports. */
export interface TenantBranding {
  businessName?: string;
  logoUrl?: string;
  /** Hex accent colour, e.g. "#0d9488". */
  primaryColor?: string;
  addressLine?: string;
  phone?: string;
  /** Footer note printed at the bottom of invoices. */
  invoiceFooter?: string;
}

export interface TenantDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  /**
   * Human-friendly login identifier (e.g. "MP-4K7TQ2") typed at the POS/dashboard
   * sign-in instead of the raw ObjectId. Auth resolves it to `_id` internally.
   * Optional only for pre-existing tenants awaiting backfill.
   */
  code?: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: Date;
  branchLimit: number;
  userLimit: number;
  branding?: TenantBranding;
  createdAt: Date;
  updatedAt: Date;
}

const brandingSchema = new Schema<TenantBranding>(
  {
    businessName: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    primaryColor: { type: String, trim: true },
    addressLine: { type: String, trim: true },
    phone: { type: String, trim: true },
    invoiceFooter: { type: String, trim: true },
  },
  { _id: false },
);

const tenantSchema = new Schema<TenantDoc>(
  {
    name: { type: String, required: true, trim: true },
    // Sparse so tenants created before the code existed don't collide on null.
    code: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    plan: { type: String, enum: ['silver', 'gold', 'platinum'], default: 'silver' },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'trialing'],
      default: 'trialing',
    },
    subscriptionExpiresAt: { type: Date },
    branchLimit: { type: Number, default: 1 },
    userLimit: { type: Number, default: 3 },
    branding: { type: brandingSchema },
  },
  { timestamps: true },
);

// Global collection — intentionally NOT tenant-scoped.
export const Tenant = model<TenantDoc>('Tenant', tenantSchema);
