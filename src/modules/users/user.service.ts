import bcrypt from 'bcryptjs';
import { FilterQuery } from 'mongoose';
import { User, UserDoc } from './user.model';
import { Tenant } from '../tenants/tenant.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import { CreateUserInput, UpdateUserInput, ListUsersQuery } from './user.validation';

const SALT_ROUNDS = 10;

export interface PublicUser {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  role: UserDoc['role'];
  branchId?: string;
  isActive: boolean;
  createdAt: Date;
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
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

/**
 * Staff management (design doc §6, /api/users). Every query is tenant-scoped
 * via the tenant-scope plugin (`withTenant`), so a missed filter can't leak
 * users across tenants.
 */
export const userService = {
  async list(tenantId: string, query: ListUsersQuery): Promise<PublicUser[]> {
    const filter: FilterQuery<UserDoc> = {};
    if (query.role) filter.role = query.role;
    if (query.branchId) filter.branchId = query.branchId;
    if (query.isActive !== undefined) filter.isActive = query.isActive;

    const users = await withTenant(User.find(filter), tenantId).sort({ createdAt: -1 });
    return users.map(toPublicUser);
  },

  async getById(tenantId: string, id: string): Promise<PublicUser> {
    const user = await withTenant(User.findById(id), tenantId);
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },

  async create(tenantId: string, input: CreateUserInput): Promise<PublicUser> {
    await assertUnderUserLimit(tenantId);

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    try {
      const user = await User.create({
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash,
        role: input.role,
        branchId: input.branchId,
      });
      return toPublicUser(user);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict('A user with this phone already exists for this tenant');
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateUserInput): Promise<PublicUser> {
    const { password, ...rest } = input;
    const update: Record<string, unknown> = { ...rest };
    if (password) update.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await withTenant(
      User.findByIdAndUpdate(id, update, { new: true, runValidators: true }),
      tenantId,
    );
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },

  /** Soft delete — deactivate rather than remove, to preserve sales history. */
  async deactivate(tenantId: string, id: string): Promise<PublicUser> {
    const user = await withTenant(
      User.findByIdAndUpdate(id, { isActive: false }, { new: true }),
      tenantId,
    );
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },
};

async function assertUnderUserLimit(tenantId: string): Promise<void> {
  const tenant = await Tenant.findById(tenantId).select('userLimit').lean();
  if (!tenant) throw ApiError.badRequest('Tenant does not exist');

  const count = await withTenant(User.countDocuments({ isActive: true }), tenantId);
  if (count >= tenant.userLimit) {
    throw ApiError.forbidden(`User limit reached for this plan (${tenant.userLimit})`);
  }
}
