import { Router } from 'express';
import { branchController } from './branch.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/branches — branch CRUD (design doc §6).
 *
 * Multi-branch is governed by the tenant's numeric `branchLimit` (enforced in
 * the service), so no boolean feature gate is needed here. Reads are open to
 * any authenticated user; mutations are owner/manager only (design doc §7).
 */
const router = Router();

router.use(authenticate);

router.get('/', branchController.list);
router.get('/:id', branchController.getById);
router.post('/', requireRole('owner', 'manager'), branchController.create);
router.patch('/:id', requireRole('owner', 'manager'), branchController.update);

export default router;
