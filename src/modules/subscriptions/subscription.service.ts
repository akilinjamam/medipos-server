import { Tenant, TenantDoc } from '../tenants/tenant.model';
import { PLAN_FEATURES, Plan, PlanFeatures } from '../../config/planFeatures';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { ChangePlanInput, WebhookInput } from './subscription.validation';

/** Per-plan staff seat limits (branch limit comes from PLAN_FEATURES). */
const USER_LIMIT: Record<Plan, number> = { silver: 3, gold: 10, platinum: 50 };

function branchLimitFor(plan: Plan): number {
  const branches = PLAN_FEATURES[plan].branches;
  return Number.isFinite(branches) ? branches : 9999;
}

export interface SubscriptionView {
  plan: Plan;
  subscriptionStatus: TenantDoc['subscriptionStatus'];
  subscriptionExpiresAt?: Date;
  branchLimit: number;
  userLimit: number;
  features: PlanFeatures;
}

function toView(tenant: TenantDoc): SubscriptionView {
  return {
    plan: tenant.plan,
    subscriptionStatus: tenant.subscriptionStatus,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt,
    branchLimit: tenant.branchLimit,
    userLimit: tenant.userLimit,
    features: PLAN_FEATURES[tenant.plan],
  };
}

export const subscriptionService = {
  async getMine(tenantId: string): Promise<SubscriptionView> {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return toView(tenant);
  },

  /**
   * Upgrade/downgrade the plan and realign limits from the feature map. A real
   * upgrade would first take payment; downgrades may need a limit pre-check
   * (e.g. too many branches for the lower tier) — left as a TODO.
   */
  async changePlan(tenantId: string, input: ChangePlanInput): Promise<SubscriptionView> {
    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      {
        plan: input.plan,
        branchLimit: branchLimitFor(input.plan),
        userLimit: USER_LIMIT[input.plan],
      },
      { new: true },
    );
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return toView(tenant);
  },

  /**
   * Payment webhook (design doc §6 — one of the few public, tenant-middleware-
   * free endpoints). Marks the subscription active and extends expiry on a
   * valid payment; flags past_due otherwise.
   */
  async handleWebhook(payload: WebhookInput): Promise<void> {
    const tenantId = payload.value_a;
    const paid = payload.status === 'VALID' || payload.status === 'VALIDATED';

    if (!paid) {
      await Tenant.updateOne({ _id: tenantId }, { subscriptionStatus: 'past_due' });
      logger.warn(`Subscription payment not valid for tenant ${tenantId} (${payload.tran_id})`);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await Tenant.updateOne(
      { _id: tenantId },
      { subscriptionStatus: 'active', subscriptionExpiresAt: expiresAt },
    );
    logger.info(`Subscription renewed for tenant ${tenantId} until ${expiresAt.toISOString()}`);
  },
};
