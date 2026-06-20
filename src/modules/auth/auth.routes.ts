import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/authenticate';

/**
 * /api/auth — login, register, token refresh, current user.
 *
 * This is one of the two route groups that bypass tenant-resolution /
 * feature-gate middleware (design doc §6); tenant context is established here.
 */
const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
