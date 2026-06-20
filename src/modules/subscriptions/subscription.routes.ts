import { Router } from 'express';
import { subscriptionController } from './subscription.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/subscriptions — plan management + payment webhook (design doc §6).
 *
 * `/webhook` is intentionally public (no auth/tenant middleware) — it's called
 * by the payment gateway. All other routes require an authenticated owner.
 */
const router = Router();

router.post('/webhook', subscriptionController.webhook);

router.get('/me', authenticate, subscriptionController.getMine);
router.post(
  '/initiate',
  authenticate,
  requireRole('owner'),
  subscriptionController.initiatePayment,
);
router.post('/change-plan', authenticate, requireRole('owner'), subscriptionController.changePlan);

export default router;
