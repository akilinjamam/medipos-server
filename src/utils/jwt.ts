import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../types/express';

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export interface RefreshPayload extends Pick<AuthPayload, 'userId' | 'tenantId'> {
  /** Unique token id — the key under which the token's state is tracked. */
  jti: string;
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
}

/** The `exp` claim (as a Date) of an already-signed token. */
export function tokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  // Fall back to "now" if somehow unset; callers use this only for a TTL row.
  return new Date((decoded?.exp ?? Math.floor(Date.now() / 1000)) * 1000);
}
