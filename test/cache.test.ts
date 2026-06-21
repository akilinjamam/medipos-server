import { describe, it, expect, vi } from 'vitest';
import { tenantCacheKey, tenantCachePrefix, cached } from '../src/utils/cache';

describe('cache key helpers', () => {
  it('builds namespaced, tenant-leading keys', () => {
    expect(tenantCacheKey('t1', 'salesReport', 123, 'all')).toBe(
      'cache:t:t1:salesReport:123:all',
    );
  });

  it('prefix matches every key for a tenant', () => {
    const key = tenantCacheKey('t1', 'salesReport', 1, 2);
    expect(key.startsWith(tenantCachePrefix('t1'))).toBe(true);
    expect(tenantCachePrefix('t1')).toBe('cache:t:t1:');
  });
});

describe('cached() without Redis', () => {
  it('runs the loader and returns its value (no-op cache)', async () => {
    const loader = vi.fn().mockResolvedValue({ ok: true });
    const value = await cached(tenantCacheKey('t1', 'x'), loader);
    expect(value).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
