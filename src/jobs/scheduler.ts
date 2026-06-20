import cron, { ScheduledTask } from 'node-cron';
import { Tenant } from '../modules/tenants/tenant.model';
import { reportService } from '../modules/reports/report.service';
import { notificationService } from '../modules/notifications/notification.service';
import { subscriptionService } from '../modules/subscriptions/subscription.service';
import { PLAN_FEATURES } from '../config/planFeatures';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * In-process cron scheduler (design doc §10, §11). Drives the recurring jobs
 * that were previously only reachable via manual endpoints:
 *   - nightly DailySummary rebuild (so profit reports are pre-aggregated),
 *   - nightly near-expiry SMS alerts (smsAlerts plans only),
 *   - weekly customer due reminders (smsAlerts plans only).
 *
 * This is the lightweight, single-VPS approach. A distributed BullMQ + Redis
 * queue (for retries/concurrency across workers) remains a separate, larger
 * piece of work — these jobs are written tenant-by-tenant so moving them onto a
 * queue later is mechanical.
 */

const tasks: ScheduledTask[] = [];

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
      logger.error(`[cron:${label}] failed for tenant ${tenant._id}`, err);
    }
  }
  logger.info(`[cron:${label}] processed ${ok}/${tenants.length} tenant(s)`);
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
  try {
    const reminded = await subscriptionService.runRenewalReminders();
    const downgraded = await subscriptionService.runAutoDowngrade();
    logger.info(`[cron:subscriptions] reminded ${reminded}, downgraded ${downgraded}`);
  } catch (err) {
    logger.error('[cron:subscriptions] failed', err);
  }
}

export async function dueRemindersJob(): Promise<void> {
  await forEachTenant('due-reminders', '_id plan', async (t) => {
    if (!PLAN_FEATURES[t.plan].smsAlerts) return;
    await notificationService.sendDueReminders(String(t._id));
  });
}

export function startScheduler(): void {
  if (!env.ENABLE_SCHEDULER) {
    logger.info('Scheduler disabled (ENABLE_SCHEDULER=false)');
    return;
  }

  // 00:30 UTC daily — rebuild yesterday's summaries, then stock alerts.
  tasks.push(
    cron.schedule(
      '30 0 * * *',
      async () => {
        await rebuildSummariesJob();
        await expiryAlertsJob();
        await lowStockAlertsJob();
      },
      { timezone: 'UTC' },
    ),
  );

  // 01:00 UTC daily — subscription renewal reminders + auto-downgrade.
  tasks.push(
    cron.schedule('0 1 * * *', () => subscriptionMaintenanceJob(), { timezone: 'UTC' }),
  );

  // 09:00 UTC every Sunday — weekly customer due reminders.
  tasks.push(
    cron.schedule('0 9 * * 0', () => dueRemindersJob(), { timezone: 'UTC' }),
  );

  logger.info(
    'Scheduler started: daily summary+expiry+low-stock (00:30 UTC), subscription maintenance (01:00 UTC), weekly due reminders (Sun 09:00 UTC)',
  );
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
