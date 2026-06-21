import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';

/**
 * /api/customers — directory, due ledger, prescription history (design doc §6).
 * Cashiers can create/look up customers at the counter; settling dues is
 * owner/manager only. Reading prescription history is a Platinum feature.
 */
const router = Router();

router.use(authenticate);

router.get('/', customerController.list);
router.get('/:id', customerController.getById);
router.post('/', customerController.create);
router.patch('/:id', customerController.update);
router.post('/:id/settle-due', requireRole('owner', 'manager'), customerController.settleDue);
// Writes are allowed on any tier (store populated early); reads are Platinum.
router.post('/:id/prescriptions', customerController.addPrescription);
router.get(
  '/:id/prescriptions',
  resolveTenant,
  requireFeature('prescriptionHistory'),
  customerController.prescriptionHistory,
);

export default router;
