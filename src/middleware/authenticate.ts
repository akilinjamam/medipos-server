import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';
import { apiTokenService } from '../modules/apiTokens/apiToken.service';
import { Tenant } from '../modules/tenants/tenant.model';
import { PLAN_FEATURES } from '../config/planFeatures';

/**
 * Establishes request identity and attaches `req.auth` + `req.tenantId`
 * (design doc §6, §7). Two credential types are accepted:
 *
 *  - `X-API-Key: mpk_…` — a programmatic API token (design doc §12). Only valid
 *    while the owning tenant's plan includes `apiAccess`, so a downgrade
 *    immediately disables its tokens.
 *  - `Authorization: Bearer <jwt>` — a normal user access token.
 *
 * Tenant resolution happens here so downstream handlers and the tenant-scoping
 * Mongoose plugin always have `req.tenantId`.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const apiKey = req.header('x-api-key');
  if (apiKey) {
    authenticateApiKey(apiKey)
      .then((auth) => {
        req.auth = auth;
        req.tenantId = auth.tenantId;
        next();
      })
      .catch(next);
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    req.tenantId = payload.tenantId;
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired access token'));
  }
};

async function authenticateApiKey(rawKey: string) {
  const auth = await apiTokenService.authenticate(rawKey);
  if (!auth) throw ApiError.unauthorized('Invalid API key');

  // Re-check the plan: a token must not outlive its tenant's apiAccess feature.
  const tenant = await Tenant.findById(auth.tenantId).select('plan').lean();
  if (!tenant || !PLAN_FEATURES[tenant.plan].apiAccess) {
    throw ApiError.forbidden('API access is not enabled for this plan');
  }
  return auth;
}
