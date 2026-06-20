import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../types/express';

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: Pick<AuthPayload, 'userId' | 'tenantId'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
}

export function verifyRefreshToken(token: string): Pick<AuthPayload, 'userId' | 'tenantId'> {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as Pick<AuthPayload, 'userId' | 'tenantId'>;
}
