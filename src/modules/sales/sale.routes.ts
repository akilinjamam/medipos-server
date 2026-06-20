import { Router } from 'express';
import { saleController } from './sale.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';

/**
 * /api/sales — billing, offline sync & returns (design doc §6, §9).
 *
 * `bulk-sync` is the offline queue endpoint and is gated to plans with
 * `offlineMode` (Gold+), so it runs through resolveTenant + feature gate.
 * Returns/refunds move money and stock, so they are owner/manager only.
 */
const router = Router();

router.use(authenticate);

// Static return routes must precede the `/:id` param route.
router.get('/returns', saleController.listReturns);
router.get('/returns/:returnId', saleController.getReturn);

router.get('/', saleController.list);
router.get('/:id', saleController.getById);
router.post('/', saleController.create);
router.post(
  '/bulk-sync',
  resolveTenant,
  requireFeature('offlineMode'),
  saleController.bulkSync,
);
router.post('/:id/returns', requireRole('owner', 'manager'), saleController.createReturn);

export default router;
