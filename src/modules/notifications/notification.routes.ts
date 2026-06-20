import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';

/**
 * /api/notifications — manual SMS triggers (design doc §6, §10).
 *
 * Gated by the plan's `smsAlerts` feature (Gold+). In production these run from
 * cron-scheduled BullMQ jobs; these endpoints are for manual/testing use.
 */
const router = Router();

router.use(authenticate, resolveTenant, requireFeature('smsAlerts'));

router.post('/expiry-alerts', requireRole('owner', 'manager'), notificationController.triggerExpiryAlerts);
router.post('/due-reminders', requireRole('owner', 'manager'), notificationController.triggerDueReminders);

export default router;
