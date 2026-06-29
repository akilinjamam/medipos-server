import { Router } from 'express';
import { tenantController } from './tenant.controller';
import { authenticate } from '../../middleware/authenticate';
import { resolveTenant } from '../../middleware/resolveTenant';
import { requireFeature } from '../../middleware/requireFeature';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/tenants — tenant & plan management.
 *
 * Per design doc §6 the admin endpoints are internal/admin-only. Guard them with
 * a platform-admin auth layer before exposing publicly; left open here so the
 * template can be exercised without a seeded admin. The `/branding` endpoints,
 * by contrast, operate on the authenticated tenant and are properly guarded.
 */
const router = Router();

// White-label branding for the authenticated tenant (declared before "/:id" so
// it isn't captured by that param route). Updates are Platinum + owner only.
router.get('/branding', authenticate, tenantController.getBranding);
router.put(
  '/branding',
  authenticate,
  resolveTenant,
  requireFeature('whiteLabeling'),
  requireRole('owner'),
  tenantController.updateBranding,
);

// The authenticated tenant's own plan/limits/features. Declared before "/:id"
// so the literal "me" isn't captured by that param route (same reason as
// "/branding" above). Safe for any signed-in user — self-scoped to req.tenantId.
router.get('/me', authenticate, tenantController.me);

router.post('/create-tenant', tenantController.create);
router.get('/', tenantController.list);
router.get('/:id', tenantController.getById);
router.patch('/:id', tenantController.update);

export default router;
