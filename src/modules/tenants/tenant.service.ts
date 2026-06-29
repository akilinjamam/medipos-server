import { Tenant, TenantDoc, TenantBranding } from './tenant.model';
import { PLAN_FEATURES, PlanFeatures, Plan } from '../../config/planFeatures';
import { ApiError } from '../../utils/ApiError';
import {
  CreateTenantInput,
  UpdateTenantInput,
  UpdateBrandingInput,
} from './tenant.validation';

/**
 * Public shape of a tenant for the dashboard's `/tenants/me`. We serialise
 * `_id -> id` explicitly (there's no global toJSON transform) and attach the
 * resolved plan feature map so the client gates off the server's single source
 * of truth (design doc §8) rather than a hand-maintained mirror.
 */
export interface CurrentTenant {
  id: string;
  name: string;
  plan: Plan;
  subscriptionStatus: TenantDoc['subscriptionStatus'];
  subscriptionExpiresAt?: Date;
  branchLimit: number;
  userLimit: number;
  branding?: TenantBranding;
  features: PlanFeatures;
}

function toCurrentTenant(tenant: TenantDoc): CurrentTenant {
  return {
    id: String(tenant._id),
    name: tenant.name,
    plan: tenant.plan,
    subscriptionStatus: tenant.subscriptionStatus,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt,
    branchLimit: tenant.branchLimit,
    userLimit: tenant.userLimit,
    branding: tenant.branding,
    features: PLAN_FEATURES[tenant.plan],
  };
}

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

  /**
   * The authenticated user's *own* tenant (plan, subscription, limits, features).
   * Self-scoped to `req.tenantId` from the JWT — unlike `getById`/`list`, which
   * are admin-only reads of arbitrary tenants. Powers the dashboard's plan gating.
   */
  async me(tenantId: string): Promise<CurrentTenant> {
    const tenant = await this.getById(tenantId);
    return toCurrentTenant(tenant);
  },

  async update(id: string, input: UpdateTenantInput): Promise<TenantDoc> {
    const tenant = await Tenant.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return tenant;
  },

  /** Read the tenant's white-label branding (empty object if unset). */
  async getBranding(id: string): Promise<TenantBranding> {
    const tenant = await Tenant.findById(id).select('branding').lean();
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return tenant.branding ?? {};
  },

  /**
   * Merge-update branding (design doc §12). Only provided fields change; passing
   * an empty value isn't supported here (use the dashboard to clear via patch of
   * explicit empty strings). Gating to Platinum is enforced at the route.
   */
  async updateBranding(id: string, input: UpdateBrandingInput): Promise<TenantBranding> {
    const $set = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [`branding.${k}`, v]),
    );
    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { $set },
      { new: true, runValidators: true },
    ).select('branding');
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return tenant.branding ?? {};
  },
};

function defaultBranchLimit(plan: Plan): number {
  const limit = PLAN_FEATURES[plan].branches;
  return Number.isFinite(limit) ? limit : 9999;
}
