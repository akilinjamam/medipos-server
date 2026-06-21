import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/utils/ApiError';

describe('ApiError', () => {
  it('maps static helpers to status codes', () => {
    expect(ApiError.badRequest().statusCode).toBe(400);
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound().statusCode).toBe(404);
    expect(ApiError.conflict().statusCode).toBe(409);
  });

  it('is an Error flagged operational and carries details', () => {
    const err = ApiError.badRequest('nope', { field: 'x' });
    expect(err).toBeInstanceOf(Error);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe('nope');
    expect(err.details).toEqual({ field: 'x' });
  });
});
