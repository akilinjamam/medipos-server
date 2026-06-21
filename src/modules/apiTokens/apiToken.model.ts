import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';
import { UserRole } from '../users/user.model';

/**
 * Programmatic API token (design doc §12 — Platinum `apiAccess`). A token lets
 * an external integration call the API without a user login. Only the SHA-256
 * `tokenHash` is stored — the raw `mpk_…` secret is shown once at creation and
 * never again. `prefix` keeps a non-sensitive fragment for display in the UI.
 *
 * Each token carries a `role` and acts on behalf of `createdBy`, so the existing
 * `requireRole` guards apply unchanged to API-token requests.
 */
export interface ApiTokenDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  tokenHash: string;
  prefix: string;
  role: UserRole;
  createdBy: Types.ObjectId;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const apiTokenSchema = new Schema<ApiTokenDoc>(
  {
    name: { type: String, required: true, trim: true },
    tokenHash: { type: String, required: true },
    prefix: { type: String, required: true },
    role: { type: String, enum: ['owner', 'manager', 'cashier'], default: 'manager' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

apiTokenSchema.plugin(tenantScopePlugin);

// Auth lookup is by hash across tenants (tenant context comes FROM the token).
apiTokenSchema.index({ tokenHash: 1 }, { unique: true });
// Tenant-scoped listing.
apiTokenSchema.index({ tenantId: 1, createdAt: -1 });

export const ApiToken = model<ApiTokenDoc>('ApiToken', apiTokenSchema);
