import { Router } from 'express';
import { productController } from './product.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/products — medicine catalog CRUD + barcode lookup (design doc §6).
 * Cashiers may read/scan; only owner/manager mutate the catalog.
 */
const router = Router();

router.use(authenticate);

router.get('/', productController.list);
router.get('/barcode/:barcode', productController.getByBarcode);
router.get('/:id', productController.getById);
router.post('/', requireRole('owner', 'manager'), productController.create);
router.patch('/:id', requireRole('owner', 'manager'), productController.update);

export default router;
