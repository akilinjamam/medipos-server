import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  tokenExpiry,
} from '../src/utils/jwt';
import { AuthPayload } from '../src/types/express';

const payload: AuthPayload = {
  userId: 'u1',
  tenantId: 't1',
  role: 'owner',
  branchId: 'b1',
};

describe('jwt access tokens', () => {
  it('round-trips an access token payload', () => {
    const decoded = verifyAccessToken(signAccessToken(payload));
    expect(decoded.userId).toBe('u1');
    expect(decoded.tenantId).toBe('t1');
    expect(decoded.role).toBe('owner');
    expect(decoded.branchId).toBe('b1');
  });

  it('rejects a tampered/invalid token', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});

describe('jwt refresh tokens', () => {
  it('carries the jti and round-trips', () => {
    const token = signRefreshToken({ userId: 'u1', tenantId: 't1', jti: 'jti-123' });
    const decoded = verifyRefreshToken(token);
    expect(decoded).toMatchObject({ userId: 'u1', tenantId: 't1', jti: 'jti-123' });
  });

  it('exposes a future expiry via tokenExpiry', () => {
    const token = signRefreshToken({ userId: 'u1', tenantId: 't1', jti: 'jti-123' });
    expect(tokenExpiry(token).getTime()).toBeGreaterThan(Date.now());
  });
});
