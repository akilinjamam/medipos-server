import { Router } from 'express';
import { transferController } from './transfer.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/transfers — cross-branch stock transfer (design doc §12). Multi-branch is
 * a Gold+ capability (enforced via `branchLimit`); moving stock between branches
 * is restricted to owner/manager.
 */
const router = Router();

router.use(authenticate);

router.get('/', transferController.list);
router.post('/', requireRole('owner', 'manager'), transferController.create);

export default router;
