import { Router } from 'express';
import { apiTokenController } from './apiToken.controller';
import { authenticate } from '../../middleware/authenticate';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/api-tokens — manage programmatic API tokens (design doc §12). Token
 * management itself is owner-only and gated behind the Platinum `apiAccess`
 * feature; the issued tokens then authenticate API calls via the `X-API-Key`
 * header (see `authenticate`).
 */
const router = Router();

router.use(authenticate, resolveTenant, requireFeature('apiAccess'), requireRole('owner'));

router.get('/', apiTokenController.list);
router.post('/', apiTokenController.create);
router.delete('/:id', apiTokenController.revoke);

export default router;
