import { Branch, BranchDoc } from './branch.model';
import { Tenant } from '../tenants/tenant.model';
import { withTenant } from '../../db/tenantScope.plugin';
import { ApiError } from '../../utils/ApiError';
import { CreateBranchInput, UpdateBranchInput } from './branch.validation';

/**
 * Branch management (design doc §6). Multi-branch is plan-limited: the numeric
 * `branchLimit` (seeded from the plan's feature map on the tenant) is enforced
 * here on create, complementing the boolean `requireFeature` gate on the route.
 */
export const branchService = {
  async list(tenantId: string): Promise<BranchDoc[]> {
    return withTenant(Branch.find(), tenantId).sort({ createdAt: 1 });
  },

  async getById(tenantId: string, id: string): Promise<BranchDoc> {
    const branch = await withTenant(Branch.findById(id), tenantId);
    if (!branch) throw ApiError.notFound('Branch not found');
    return branch;
  },

  async create(tenantId: string, input: CreateBranchInput): Promise<BranchDoc> {
    await assertUnderBranchLimit(tenantId);

    // Only one branch may be flagged as the main branch.
    if (input.isMainBranch) await clearMainBranch(tenantId);

    try {
      return await Branch.create({ tenantId, ...input });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict('A branch with this name already exists');
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateBranchInput): Promise<BranchDoc> {
    if (input.isMainBranch) await clearMainBranch(tenantId);

    const branch = await withTenant(
      Branch.findByIdAndUpdate(id, input, { new: true, runValidators: true }),
      tenantId,
    );
    if (!branch) throw ApiError.notFound('Branch not found');
    return branch;
  },
};

async function assertUnderBranchLimit(tenantId: string): Promise<void> {
  const tenant = await Tenant.findById(tenantId).select('branchLimit').lean();
  if (!tenant) throw ApiError.badRequest('Tenant does not exist');

  const count = await withTenant(Branch.countDocuments({ isActive: true }), tenantId);
  if (count >= tenant.branchLimit) {
    throw ApiError.forbidden(`Branch limit reached for this plan (${tenant.branchLimit})`);
  }
}

async function clearMainBranch(tenantId: string): Promise<void> {
  await withTenant(Branch.updateMany({ isMainBranch: true }, { isMainBranch: false }), tenantId);
}
