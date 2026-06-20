import { Router } from 'express';
import { saleController } from './sale.controller';
import { authenticate } from '../../middleware/authenticate';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';

/**
 * /api/sales — billing & offline sync (design doc §6, §9).
 *
 * `bulk-sync` is the offline queue endpoint and is gated to plans with
 * `offlineMode` (Gold+), so it runs through resolveTenant + feature gate.
 */
const router = Router();

router.use(authenticate);

router.get('/', saleController.list);
router.get('/:id', saleController.getById);
router.post('/', saleController.create);
router.post(
  '/bulk-sync',
  resolveTenant,
  requireFeature('offlineMode'),
  saleController.bulkSync,
);

export default router;
