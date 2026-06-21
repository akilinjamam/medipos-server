import { Tenant } from '../modules/tenants/tenant.model';
import { reportService } from '../modules/reports/report.service';
import { notificationService } from '../modules/notifications/notification.service';
import { subscriptionService } from '../modules/subscriptions/subscription.service';
import { PLAN_FEATURES } from '../config/planFeatures';
import { logger } from '../utils/logger';

/**
 * The recurring background jobs (design doc §10, §11), defined independently of
 * how they're triggered. Both the in-process node-cron runner (`scheduler.ts`)
 * and the distributed BullMQ runner (`queue.ts`) execute these same functions
 * via the `JOB_RUNNERS` registry, so the work is identical regardless of runner.
 */

/** Midnight (UTC) of the previous day — the window the nightly rebuild covers. */
function yesterdayUtc(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Run `fn` for every tenant, isolating failures so one bad tenant isn't fatal. */
async function forEachTenant(
  label: string,
  select: string,
  fn: (tenant: { _id: unknown; plan: keyof typeof PLAN_FEATURES }) => Promise<void>,
): Promise<void> {
  const tenants = await Tenant.find().select(select).lean();
  let ok = 0;
  for (const tenant of tenants) {
    try {
      await fn(tenant as { _id: unknown; plan: keyof typeof PLAN_FEATURES });
      ok += 1;
    } catch (err) {
      logger.error(`[job:${label}] failed for tenant ${tenant._id}`, err);
    }
  }
  logger.info(`[job:${label}] processed ${ok}/${tenants.length} tenant(s)`);
}

export async function rebuildSummariesJob(): Promise<void> {
  const date = yesterdayUtc();
  await forEachTenant('summary-rebuild', '_id', async (t) => {
    await reportService.rebuildDailySummary(String(t._id), date);
  });
}

export async function expiryAlertsJob(): Promise<void> {
  await forEachTenant('expiry-alerts', '_id plan', async (t) => {
    if (!PLAN_FEATURES[t.plan].smsAlerts) return;
    await notificationService.sendExpiryAlertsToManagers(String(t._id));
  });
}

export async function lowStockAlertsJob(): Promise<void> {
  await forEachTenant('low-stock-alerts', '_id plan', async (t) => {
    if (!PLAN_FEATURES[t.plan].smsAlerts) return;
    await notificationService.sendLowStockAlertsToManagers(String(t._id));
  });
}

/** Renewal reminders + auto-downgrade of lapsed plans (iterates tenants itself). */
export async function subscriptionMaintenanceJob(): Promise<void> {
  const reminded = await subscriptionService.runRenewalReminders();
  const downgraded = await subscriptionService.runAutoDowngrade();
  logger.info(`[job:subscriptions] reminded ${reminded}, downgraded ${downgraded}`);
}

export async function dueRemindersJob(): Promise<void> {
  await forEachTenant('due-reminders', '_id plan', async (t) => {
    if (!PLAN_FEATURES[t.plan].smsAlerts) return;
    await notificationService.sendDueReminders(String(t._id));
  });
}

/** The nightly bundle: rebuild summaries, then run the stock alerts off them. */
export async function dailyMaintenanceJob(): Promise<void> {
  await rebuildSummariesJob();
  await expiryAlertsJob();
  await lowStockAlertsJob();
}

/**
 * Canonical job names. Used as BullMQ job names and node-cron task labels — keep
 * them stable so BullMQ repeatable-job keys don't churn across deploys.
 */
export type JobName = 'daily-maintenance' | 'subscription-maintenance' | 'due-reminders';

/** Name → handler. The single source of truth for what each job does. */
export const JOB_RUNNERS: Record<JobName, () => Promise<void>> = {
  'daily-maintenance': dailyMaintenanceJob,
  'subscription-maintenance': subscriptionMaintenanceJob,
  'due-reminders': dueRemindersJob,
};

/** Name → cron pattern (UTC). Consumed by both the cron and BullMQ runners. */
export const JOB_SCHEDULES: { name: JobName; pattern: string }[] = [
  // 00:30 UTC daily — rebuild yesterday's summaries, then stock alerts.
  { name: 'daily-maintenance', pattern: '30 0 * * *' },
  // 01:00 UTC daily — subscription renewal reminders + auto-downgrade.
  { name: 'subscription-maintenance', pattern: '0 1 * * *' },
  // 09:00 UTC every Sunday — weekly customer due reminders.
  { name: 'due-reminders', pattern: '0 9 * * 0' },
];
