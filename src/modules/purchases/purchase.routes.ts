import { Router } from 'express';
import { purchaseController } from './purchase.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/purchases — purchase orders & goods receipt (design doc §6).
 * Purchasing is owner/manager only.
 */
const router = Router();

router.use(authenticate);

router.get('/', requireRole('owner', 'manager'), purchaseController.list);
router.get('/:id', requireRole('owner', 'manager'), purchaseController.getById);
router.post('/', requireRole('owner', 'manager'), purchaseController.create);
router.post('/:id/receive', requireRole('owner', 'manager'), purchaseController.receive);
router.post('/:id/cancel', requireRole('owner', 'manager'), purchaseController.cancel);

export default router;
