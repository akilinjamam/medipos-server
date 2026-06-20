import { Router } from 'express';
import { userController } from './user.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/users — staff management & role assignment (design doc §6).
 *
 * All routes require authentication; managing staff is restricted to
 * owner/manager (design doc §7). `req.tenantId` (set by `authenticate`) scopes
 * every query to the caller's tenant.
 */
const router = Router();

router.use(authenticate);

router.get('/', requireRole('owner', 'manager'), userController.list);
router.get('/:id', requireRole('owner', 'manager'), userController.getById);
router.post('/', requireRole('owner', 'manager'), userController.create);
router.patch('/:id', requireRole('owner', 'manager'), userController.update);
router.delete('/:id', requireRole('owner'), userController.deactivate);

export default router;
