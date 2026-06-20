import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { subscriptionService } from './subscription.service';
import { changePlanSchema, webhookSchema } from './subscription.validation';

export const subscriptionController = {
  getMine: asyncHandler(async (req: Request, res: Response) => {
    const view = await subscriptionService.getMine(req.tenantId!);
    res.json({ data: view });
  }),

  changePlan: asyncHandler(async (req: Request, res: Response) => {
    const input = changePlanSchema.parse(req.body);
    const view = await subscriptionService.changePlan(req.tenantId!, input);
    res.json({ data: view });
  }),

  // Public endpoint — no auth/tenant middleware (design doc §6).
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = webhookSchema.parse(req.body);
    await subscriptionService.handleWebhook(payload);
    // Always 200 so the payment gateway doesn't retry a processed event.
    res.json({ received: true });
  }),
};
