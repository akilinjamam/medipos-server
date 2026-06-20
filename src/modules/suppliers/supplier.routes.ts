import { Router } from 'express';
import { supplierController } from './supplier.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/suppliers — supplier directory + due ledger (design doc §6).
 */
const router = Router();

router.use(authenticate);

router.get('/', supplierController.list);
router.get('/:id', supplierController.getById);
router.post('/', requireRole('owner', 'manager'), supplierController.create);
router.patch('/:id', requireRole('owner', 'manager'), supplierController.update);
router.post('/:id/settle-due', requireRole('owner', 'manager'), supplierController.settleDue);

export default router;
