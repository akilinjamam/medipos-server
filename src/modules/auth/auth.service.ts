import bcrypt from 'bcryptjs';
import { User, UserDoc } from '../users/user.model';
import { Tenant } from '../tenants/tenant.model';
import { ApiError } from '../../utils/ApiError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { AuthPayload } from '../../types/express';
import { RegisterInput, LoginInput } from './auth.validation';

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

function issueTokens(user: UserDoc): Omit<AuthResult, 'user'> {
  return {
    accessToken: signAccessToken(buildPayload(user)),
    refreshToken: signRefreshToken({
      userId: String(user._id),
      tenantId: String(user.tenantId),
    }),
  };
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

    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    // tenantId is part of the lookup, so no need for the tenant-scope plugin here.
    const user = await User.findOne({ tenantId: input.tenantId, phone: input.phone }).select(
      '+passwordHash',
    );
    if (!user || !user.isActive) throw ApiError.unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');

    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  /**
   * Exchanges a valid refresh token for a fresh access token. The user is
   * re-read so role/branch changes take effect and disabled users are rejected.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let decoded: Pick<AuthPayload, 'userId' | 'tenantId'>;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await User.findOne({ _id: decoded.userId, tenantId: decoded.tenantId });
    if (!user || !user.isActive) throw ApiError.unauthorized('User no longer active');

    return { accessToken: signAccessToken(buildPayload(user)) };
  },

  async me(userId: string, tenantId: string): Promise<PublicUser> {
    const user = await User.findOne({ _id: userId, tenantId });
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },
};
