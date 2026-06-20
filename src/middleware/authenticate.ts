import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the Bearer access token and attaches `req.auth` + `req.tenantId`.
 * Tenant resolution happens here so downstream handlers and the tenant-scoping
 * Mongoose plugin always have `req.tenantId` available (design doc §6, §7).
 */
export const authenticate: RequestHandler = (req, _res, next) => {
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
