import { Plan } from '../../config/planFeatures';

/**
 * Monthly subscription price per plan, in BDT (design doc §4). The webhook
 * cross-checks the amount SSLCommerz reports against this map before activating
 * a plan, so a tampered payload can't buy a tier for the wrong price.
 */
export const PLAN_PRICES: Record<Plan, number> = {
  silver: 1000,
  gold: 2500,
  platinum: 5000,
};

/** Per-plan staff seat limits (branch limit comes from PLAN_FEATURES). */
export const USER_LIMIT: Record<Plan, number> = { silver: 3, gold: 10, platinum: 50 };
