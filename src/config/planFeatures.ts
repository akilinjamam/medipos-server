/**
 * Single source of truth for plan-based feature gating (design doc §8).
 *
 * Never scatter `if (plan === 'gold')` checks across the codebase — gate
 * endpoints through `requireFeature(...)` which reads this map.
 */
export type Plan = 'silver' | 'gold' | 'platinum';

export interface PlanFeatures {
  /** Max branches a tenant may create. */
  branches: number;
  /** Offline POS billing + bulk sync. */
  offlineMode: boolean;
  /** Expiry / refill / due SMS reminders. */
  smsAlerts: boolean;
  /** Programmatic API token access. */
  apiAccess: boolean;
  /** Custom branding (logo/colors/business name) on invoices & reports. */
  whiteLabeling: boolean;
  /** Customer prescription history read/export. */
  prescriptionHistory: boolean;
}

export type FeatureName = keyof PlanFeatures;

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  silver: {
    branches: 1,
    offlineMode: false,
    smsAlerts: false,
    apiAccess: false,
    whiteLabeling: false,
    prescriptionHistory: false,
  },
  gold: {
    branches: 5,
    offlineMode: true,
    smsAlerts: true,
    apiAccess: false,
    whiteLabeling: false,
    prescriptionHistory: false,
  },
  platinum: {
    branches: Infinity,
    offlineMode: true,
    smsAlerts: true,
    apiAccess: true,
    whiteLabeling: true,
    prescriptionHistory: true,
  },
};
