import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { User, UserDoc } from '../users/user.model';
import { Tenant } from '../tenants/tenant.model';
import { RefreshToken } from './refreshToken.model';
import { ApiError } from '../../utils/ApiError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  tokenExpiry,
} from '../../utils/jwt';
import { withTenant } from '../../db/tenantScope.plugin';
import { AuthPayload } from '../../types/express';
import { RegisterInput, LoginInput, UpdateProfileInput } from './auth.validation';

const SALT_ROUNDS = 10;

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  role: UserDoc['role'];
  branchId?: string;
}

function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: String(user._id),
    tenantId: String(user.tenantId),
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    branchId: user.branchId ? String(user.branchId) : undefined,
  };
}

function buildPayload(user: UserDoc): AuthPayload {
  return {
    userId: String(user._id),
    tenantId: String(user.tenantId),
    role: user.role,
    branchId: user.branchId ? String(user.branchId) : undefined,
  };
}

/**
 * Issue an access token plus a fresh, persisted refresh token. The refresh
 * token's `jti` is recorded so it can be rotated/revoked later. `replaces` links
 * a rotated-from token for reuse detection.
 */
async function issueTokens(user: UserDoc, replaces?: string): Promise<Omit<AuthResult, 'user'>> {
  const jti = randomUUID();
  const refreshToken = signRefreshToken({
    userId: String(user._id),
    tenantId: String(user.tenantId),
    jti,
  });

  await RefreshToken.create({
    tenantId: user.tenantId,
    userId: user._id,
    jti,
    expiresAt: tokenExpiry(refreshToken),
  });

  if (replaces) {
    await withTenant(
      RefreshToken.updateOne({ jti: replaces }, { $set: { replacedByJti: jti } }),
      String(user.tenantId),
    );
  }

  return { accessToken: signAccessToken(buildPayload(user)), refreshToken };
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const tenant = await Tenant.findById(input.tenantId);
    if (!tenant) throw ApiError.badRequest('Tenant does not exist');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    let user: UserDoc;
    try {
      user = await User.create({
        tenantId: input.tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash,
        role: input.role ?? 'cashier',
        branchId: input.branchId,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict('A user with this phone already exists for this tenant');
      }
      throw err;
    }

    return { user: toPublicUser(user), ...(await issueTokens(user)) };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    // tenantId is part of the lookup, so no need for the tenant-scope plugin here.
    const user = await User.findOne({ tenantId: input.tenantId, phone: input.phone }).select(
      '+passwordHash',
    );
    if (!user || !user.isActive) throw ApiError.unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');

    return { user: toPublicUser(user), ...(await issueTokens(user)) };
  },

  /**
   * Rotating refresh (design doc §7): exchange a valid refresh token for a new
   * access + refresh pair, revoking the presented token so it can't be reused.
   * The user is re-read so role/branch changes take effect and disabled users
   * are rejected.
   *
   * Reuse detection: presenting an already-revoked token means it was either
   * already rotated or stolen — every refresh token for that user is revoked.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const record = await withTenant(
      RefreshToken.findOne({ jti: decoded.jti, userId: decoded.userId }),
      decoded.tenantId,
    );
    if (!record) throw ApiError.unauthorized('Refresh token not recognized');

    if (record.revokedAt) {
      // Token was already used/revoked — treat as compromise and revoke all.
      await withTenant(
        RefreshToken.updateMany(
          { userId: decoded.userId, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date() } },
        ),
        decoded.tenantId,
      );
      throw ApiError.unauthorized('Refresh token already used — session revoked');
    }

    const user = await User.findOne({ _id: decoded.userId, tenantId: decoded.tenantId });
    if (!user || !user.isActive) throw ApiError.unauthorized('User no longer active');

    record.revokedAt = new Date();
    await record.save();

    return issueTokens(user, decoded.jti);
  },

  /** Revoke the presented refresh token (logout). Best-effort — never throws. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      await withTenant(
        RefreshToken.updateOne({ jti: decoded.jti }, { $set: { revokedAt: new Date() } }),
        decoded.tenantId,
      );
    } catch {
      // Invalid/expired token — nothing to revoke.
    }
  },

  async me(userId: string, tenantId: string): Promise<PublicUser> {
    const user = await User.findOne({ _id: userId, tenantId });
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },

  /**
   * Self-service profile edit. Deliberately narrow — only name/email; role,
   * branch and phone are managed by owners/managers via /api/users. An empty
   * email string clears the field.
   */
  async updateProfile(
    userId: string,
    tenantId: string,
    input: UpdateProfileInput,
  ): Promise<PublicUser> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.email !== undefined) {
      if (input.email === '') unset.email = '';
      else set.email = input.email;
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    const user = await User.findOneAndUpdate({ _id: userId, tenantId }, update, {
      new: true,
      runValidators: true,
    });
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },

  /** Change own password after verifying the current one. */
  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await User.findOne({ _id: userId, tenantId }).select('+passwordHash');
    if (!user) throw ApiError.notFound('User not found');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
  },
};
