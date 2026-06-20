import { Router } from 'express';
import { tenantController } from './tenant.controller';

/**
 * /api/tenants — tenant & plan management.
 *
 * Per design doc §6 these are internal/admin-only endpoints. Guard them with a
 * platform-admin auth layer before exposing publicly; left open here so the
 * template can be exercised without a seeded admin.
 */
const router = Router();

router.post('/create-tenant', tenantController.create);
router.get('/', tenantController.list);
router.get('/:id', tenantController.getById);
router.patch('/:id', tenantController.update);

export default router;
