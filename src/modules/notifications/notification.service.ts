import { smsGateway } from './sms.gateway';
import { batchService } from '../batches/batch.service';
import { Customer } from '../customers/customer.model';
import { User } from '../users/user.model';
import { withTenant } from '../../db/tenantScope.plugin';

/** Active owner/manager phone numbers for a tenant — the alert recipients. */
async function managerPhones(tenantId: string): Promise<string[]> {
  const managers = await withTenant(
    User.find({ role: { $in: ['owner', 'manager'] }, isActive: true }),
    tenantId,
  );
  return managers.map((u) => u.phone).filter(Boolean);
}

/**
 * Notification triggers (design doc §10). These are written to be called by
 * the cron scheduler; manual endpoints exist for testing. The plan's
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

  /**
   * Cron entry point: alert every owner/manager of the tenant about near-expiry
   * stock. Resolves recipients itself (the request-path variant takes a phone).
   */
  async sendExpiryAlertsToManagers(tenantId: string, withinDays = 30) {
    const batches = await batchService.nearExpiry(tenantId, { withinDays });
    if (!batches.length) return { queued: 0, batches: 0 };

    const phones = await managerPhones(tenantId);
    if (!phones.length) return { queued: 0, batches: batches.length };

    const body = `MediPOS: ${batches.length} batch(es) expiring within ${withinDays} days. Please review.`;
    const { queued } = await smsGateway.sendMany(phones.map((to) => ({ to, body })));
    return { queued, batches: batches.length };
  },

  /**
   * Cron entry point: alert owners/managers when products have dropped to/below
   * their `reorderLevel` (per branch) so they can restock.
   */
  async sendLowStockAlertsToManagers(tenantId: string) {
    const rows = await batchService.lowStock(tenantId, {});
    if (!rows.length) return { queued: 0, products: 0 };

    const phones = await managerPhones(tenantId);
    if (!phones.length) return { queued: 0, products: rows.length };

    const body = `MediPOS: ${rows.length} product(s) at/below reorder level. Please reorder.`;
    const { queued } = await smsGateway.sendMany(phones.map((to) => ({ to, body })));
    return { queued, products: rows.length };
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
