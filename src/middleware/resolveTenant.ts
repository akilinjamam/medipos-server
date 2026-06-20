import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { Tenant } from '../modules/tenants/tenant.model';

/**
 * Loads the authenticated user's tenant and attaches `req.tenant` (id + plan)
 * for feature gating. Run after `authenticate`. Kept separate so most routes
 * can rely on `req.tenantId` alone and only plan-gated routes pay the lookup.
 */
export const resolveTenant: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.tenantId) throw ApiError.unauthorized();

  const tenant = await Tenant.findById(req.tenantId).select('plan subscriptionStatus').lean();
  if (!tenant) throw ApiError.unauthorized('Tenant no longer exists');

  req.tenant = { id: String(tenant._id), plan: tenant.plan };
  next();
});
