import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { notificationService } from './notification.service';
import { expiryAlertSchema } from './notification.validation';

export const notificationController = {
  triggerExpiryAlerts: asyncHandler(async (req: Request, res: Response) => {
    const input = expiryAlertSchema.parse(req.body);
    const result = await notificationService.sendExpiryAlerts(
      req.tenantId!,
      input.managerPhone,
      input.withinDays,
    );
    res.json({ data: result });
  }),

  triggerDueReminders: asyncHandler(async (req: Request, res: Response) => {
    const result = await notificationService.sendDueReminders(req.tenantId!);
    res.json({ data: result });
  }),
};
