import { Router } from 'express';
import { batchController } from './batch.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/batches — stock-in, FEFO suggestions, expiry tracking (design doc §6).
 * Deleting a batch is owner/manager only (design doc §7).
 */
const router = Router();

router.use(authenticate);

router.get('/', batchController.list);
router.get('/pdf', batchController.exportPdf);
router.get('/fefo', batchController.fefo);
router.get('/near-expiry', batchController.nearExpiry);
router.get('/low-stock', batchController.lowStock);
router.get('/:id', batchController.getById);
router.post('/', requireRole('owner', 'manager'), batchController.create);
router.patch('/:id', requireRole('owner', 'manager'), batchController.update);
router.delete('/:id', requireRole('owner', 'manager'), batchController.remove);

export default router;
