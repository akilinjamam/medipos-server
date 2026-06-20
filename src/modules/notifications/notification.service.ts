import { smsGateway } from './sms.gateway';
import { batchService } from '../batches/batch.service';
import { Customer } from '../customers/customer.model';
import { withTenant } from '../../db/tenantScope.plugin';

/**
 * Notification triggers (design doc §10). These are written to be called by
 * cron-scheduled BullMQ jobs; manual endpoints exist for testing. The plan's
 * `smsAlerts` feature is enforced at the route layer.
 */
export const notificationService = {
  /** SMS the manager about batches expiring within `withinDays`. */
  async sendExpiryAlerts(tenantId: string, managerPhone: string, withinDays = 30) {
    const batches = await batchService.nearExpiry(tenantId, { withinDays });
    if (!batches.length) return { queued: 0, batches: 0 };

    const body = `MediPOS: ${batches.length} batch(es) expiring within ${withinDays} days. Please review.`;
    await smsGateway.send({ to: managerPhone, body });
    return { queued: 1, batches: batches.length };
  },

  /** Weekly customer due-balance reminders (Gold+). */
  async sendDueReminders(tenantId: string) {
    const customers = await withTenant(
      Customer.find({ dueBalance: { $gt: 0 }, phone: { $ne: null } }),
      tenantId,
    );

    const messages = customers
      .filter((c) => c.phone)
      .map((c) => ({
        to: c.phone!,
        body: `Dear ${c.name}, your pharmacy due is BDT ${c.dueBalance}. Please clear at your earliest convenience.`,
      }));

    return smsGateway.sendMany(messages);
  },
};
