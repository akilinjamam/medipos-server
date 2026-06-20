import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { AuthPayload } from '../types/express';

type Role = AuthPayload['role'];

/**
 * Guards sensitive routes by role (design doc §7), e.g.
 * `requireRole('owner', 'manager')` on batch deletion or profit reports.
 */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('Insufficient role for this action'));
    }
    return next();
  };
