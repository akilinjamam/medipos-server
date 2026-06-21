import { Router } from 'express';
import { reportController } from './report.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

/**
 * /api/reports — pre-aggregated business reports (design doc §11).
 * Profit/loss is owner-only (design doc §7); operational reports allow managers.
 */
const router = Router();

router.use(authenticate);

router.get('/sales', requireRole('owner', 'manager'), reportController.sales);
router.get('/sales/pdf', requireRole('owner', 'manager'), reportController.salesPdf);
router.get('/profit-loss', requireRole('owner'), reportController.profitLoss);
router.get('/dashboard', requireRole('owner', 'manager'), reportController.dashboard);
router.get('/movers', requireRole('owner', 'manager'), reportController.movers);
router.get('/expiry', requireRole('owner', 'manager'), reportController.expiry);
router.post('/rebuild-summary', requireRole('owner'), reportController.rebuild);

export default router;
