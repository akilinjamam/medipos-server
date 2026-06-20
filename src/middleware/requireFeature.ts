import { RequestHandler } from 'express';
import { FeatureName, PLAN_FEATURES } from '../config/planFeatures';
import { ApiError } from '../utils/ApiError';

/**
 * Plan-based feature gate (design doc §8). Reads the single `PLAN_FEATURES`
 * map so gating logic lives in exactly one place.
 *
 * Requires `req.tenant` to be populated (see `resolveTenant`). Boolean features
 * are checked for truthiness; numeric limits (e.g. branch count) are enforced
 * inside the relevant service, not here.
 */
export const requireFeature =
  (feature: FeatureName): RequestHandler =>
  (req, _res, next) => {
    const plan = req.tenant?.plan;
    if (!plan) return next(ApiError.forbidden('Tenant context not resolved'));

    const value = PLAN_FEATURES[plan][feature];
    if (!value) {
      return next(ApiError.forbidden(`Your plan (${plan}) does not include: ${feature}`));
    }
    return next();
  };
