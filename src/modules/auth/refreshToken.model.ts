import { Schema, model, Document, Types } from 'mongoose';
import { tenantScopePlugin } from '../../db/tenantScope.plugin';

/**
 * Persistent record of an issued refresh token, keyed by its `jti` (the token's
 * JWT id claim). Makes refresh tokens stateful so they can be rotated on use and
 * revoked on logout (design doc §7 — stateless refresh was a known gap).
 *
 * Only the `jti` is stored, never the token string itself: the signed JWT is the
 * bearer credential, this row is just its revocation/rotation state. A TTL index
 * on `expiresAt` lets Mongo purge expired rows automatically.
 */
export interface RefreshTokenDoc extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** jti of the token that replaced this one on rotation (for reuse detection). */
  replacedByJti?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedByJti: { type: String },
  },
  { timestamps: true },
);

refreshTokenSchema.plugin(tenantScopePlugin);

// Lookup on refresh is by tenant + jti.
refreshTokenSchema.index({ tenantId: 1, jti: 1 }, { unique: true });
// Reuse detection / bulk revoke for a user.
refreshTokenSchema.index({ tenantId: 1, userId: 1 });
// Auto-purge expired rows.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
