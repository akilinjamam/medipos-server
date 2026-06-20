import { Tenant, TenantDoc } from './tenant.model';
import { PLAN_FEATURES, Plan } from '../../config/planFeatures';
import { ApiError } from '../../utils/ApiError';
import { CreateTenantInput, UpdateTenantInput } from './tenant.validation';

/**
 * Tenant management (design doc §6 — "internal/admin only"). The Tenant
 * collection is global and intentionally not tenant-scoped.
 */
export const tenantService = {
  async create(input: CreateTenantInput): Promise<TenantDoc> {
    const plan: Plan = input.plan ?? 'silver';
    return Tenant.create({
      ...input,
      plan,
      // Seed limits from the plan's feature map unless explicitly overridden.
      branchLimit: input.branchLimit ?? defaultBranchLimit(plan),
      userLimit: input.userLimit ?? 3,
    });
  },

  async list(): Promise<TenantDoc[]> {
    return Tenant.find().sort({ createdAt: -1 });
  },

  async getById(id: string): Promise<TenantDoc> {
    const tenant = await Tenant.findById(id);
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return tenant;
  },

  async update(id: string, input: UpdateTenantInput): Promise<TenantDoc> {
    const tenant = await Tenant.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return tenant;
  },
};

function defaultBranchLimit(plan: Plan): number {
  const limit = PLAN_FEATURES[plan].branches;
  return Number.isFinite(limit) ? limit : 9999;
}
