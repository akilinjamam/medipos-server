import { Tenant, TenantDoc } from '../tenants/tenant.model';
import { User } from '../users/user.model';
import { PLAN_FEATURES, Plan, PlanFeatures } from '../../config/planFeatures';
import { withTenant } from '../../db/tenantScope.plugin';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { ChangePlanInput, InitiatePaymentInput, WebhookInput } from './subscription.validation';
import { PLAN_PRICES, USER_LIMIT } from './subscription.config';
import { sslcommerzGateway } from './sslcommerz.gateway';
import { smsGateway } from '../notifications/sms.gateway';

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

/** Apply a plan to a tenant, realigning all derived limits from the maps. */
async function applyPlan(
  tenantId: string,
  plan: Plan,
  patch: Partial<Pick<TenantDoc, 'subscriptionStatus' | 'subscriptionExpiresAt'>> = {},
): Promise<TenantDoc | null> {
  return Tenant.findByIdAndUpdate(
    tenantId,
    {
      plan,
      branchLimit: branchLimitFor(plan),
      userLimit: USER_LIMIT[plan],
      ...patch,
    },
    { new: true },
  );
}

export const subscriptionService = {
  async getMine(tenantId: string): Promise<SubscriptionView> {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return toView(tenant);
  },

  /**
   * Direct plan change (admin/manual path — no payment). The paid path is
   * `initiatePayment` → SSLCommerz → `handleWebhook`.
   */
  async changePlan(tenantId: string, input: ChangePlanInput): Promise<SubscriptionView> {
    const tenant = await applyPlan(tenantId, input.plan);
    if (!tenant) throw ApiError.notFound('Tenant not found');
    return toView(tenant);
  },

  /**
   * Start a paid subscription checkout (design doc §4). Creates an SSLCommerz
   * session and returns the hosted GatewayPageURL for the client to redirect to.
   * The plan is NOT changed here — only after the IPN is validated.
   */
  async initiatePayment(
    tenantId: string,
    input: InitiatePaymentInput,
  ): Promise<{ gatewayUrl: string; tranId: string; amount: number }> {
    if (!sslcommerzGateway.isConfigured()) {
      throw new ApiError(503, 'Payment gateway is not configured');
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw ApiError.notFound('Tenant not found');

    const amount = PLAN_PRICES[input.plan];
    // A fresh, unique transaction id per attempt.
    const tranId = `MP-${tenantId}-${Date.now()}`;

    // Bill contact = the tenant owner (first one found).
    const owner = await withTenant(
      User.findOne({ role: 'owner', isActive: true }),
      tenantId,
    );

    const apiBase = env.APP_BASE_URL.replace(/\/$/, '');
    const session = await sslcommerzGateway.initSession({
      tranId,
      amount,
      plan: input.plan,
      tenantId,
      customerName: owner?.name ?? tenant.name,
      customerPhone: owner?.phone ?? '01700000000',
      customerEmail: owner?.email,
      successUrl: `${apiBase}/api/v1/subscriptions/payment-return?result=success`,
      failUrl: `${apiBase}/api/v1/subscriptions/payment-return?result=fail`,
      cancelUrl: `${apiBase}/api/v1/subscriptions/payment-return?result=cancel`,
      ipnUrl: `${apiBase}/api/v1/subscriptions/webhook`,
    });

    logger.info(`Subscription checkout started for tenant ${tenantId} (${input.plan}, ${tranId})`);
    return { gatewayUrl: session.gatewayUrl, tranId, amount };
  },

  /**
   * Payment IPN handler (design doc §6 — public, no tenant middleware). Trusts
   * nothing in the payload: it (1) checks the `verify_sign` hash, (2) re-validates
   * the transaction with SSLCommerz via `val_id`, and (3) confirms the paid
   * amount matches the plan's price before activating. Anything off → `past_due`.
   */
  async handleWebhook(payload: WebhookInput): Promise<void> {
    const body = payload as unknown as Record<string, string>;
    const tenantId = payload.value_a;

    const markPastDue = async (why: string) => {
      await Tenant.updateOne({ _id: tenantId }, { subscriptionStatus: 'past_due' });
      logger.warn(`Subscription payment rejected for tenant ${tenantId} (${payload.tran_id}): ${why}`);
    };

    // (1) Signature — proves the IPN came from SSLCommerz (carries our passwd).
    if (sslcommerzGateway.isConfigured() && !sslcommerzGateway.verifySignature(body)) {
      return markPastDue('signature mismatch');
    }

    // (2) Server-side validation via val_id (authoritative source of truth).
    if (!payload.val_id) return markPastDue('missing val_id');
    const result = await sslcommerzGateway.validate(payload.val_id);
    if (result.status !== 'VALID' && result.status !== 'VALIDATED') {
      return markPastDue(`validation status ${result.status}`);
    }

    // (3) The purchased plan + that the right amount was actually paid.
    const plan = result.valueB as Plan | undefined;
    if (!plan || !(plan in PLAN_PRICES)) return markPastDue('unknown plan');
    if (result.amount !== PLAN_PRICES[plan]) {
      return markPastDue(`amount ${result.amount} != price ${PLAN_PRICES[plan]}`);
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await applyPlan(tenantId, plan, {
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt,
    });
    logger.info(`Subscription ${plan} active for tenant ${tenantId} until ${expiresAt.toISOString()}`);
  },

  /**
   * Cron job (design doc §10): remind owners of paid plans whose subscription
   * expires within `withinDays` so they renew before auto-downgrade. Iterates
   * the global Tenant collection (not tenant-scoped). Returns how many reminded.
   */
  async runRenewalReminders(withinDays = 7): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + withinDays);

    const tenants = await Tenant.find({
      plan: { $ne: 'silver' },
      subscriptionStatus: { $in: ['active', 'past_due'] },
      subscriptionExpiresAt: { $gte: now, $lte: cutoff },
    });

    let reminded = 0;
    for (const tenant of tenants) {
      const owner = await withTenant(
        User.findOne({ role: 'owner', isActive: true }),
        String(tenant._id),
      );
      if (!owner?.phone) continue;
      const on = tenant.subscriptionExpiresAt?.toISOString().slice(0, 10) ?? 'soon';
      await smsGateway.send({
        to: owner.phone,
        body: `MediPOS: your ${tenant.plan} subscription expires on ${on}. Please renew to avoid downgrade to Silver.`,
      });
      reminded += 1;
    }
    return reminded;
  },

  /**
   * Cron job (design doc §10): auto-downgrade any paid plan whose subscription
   * has lapsed (expiry passed and not renewed) to the free Silver tier and mark
   * it canceled. Limits realign via `applyPlan`; existing branches/users over
   * the new cap are kept (only new creation is blocked). Returns how many.
   */
  async runAutoDowngrade(): Promise<number> {
    const now = new Date();
    const expired = await Tenant.find({
      plan: { $ne: 'silver' },
      subscriptionExpiresAt: { $lt: now },
    });

    for (const tenant of expired) {
      await applyPlan(String(tenant._id), 'silver', { subscriptionStatus: 'canceled' });
      logger.warn(`Subscription lapsed — tenant ${tenant._id} downgraded to Silver`);

      const owner = await withTenant(
        User.findOne({ role: 'owner', isActive: true }),
        String(tenant._id),
      );
      if (owner?.phone) {
        await smsGateway.send({
          to: owner.phone,
          body: `MediPOS: your subscription has expired and your account was downgraded to Silver. Renew to restore features.`,
        });
      }
    }
    return expired.length;
  },
};
