import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Thin Redis-backed cache (design doc §2). Optional and best-effort: when
 * `REDIS_URL` is unset (`getRedis()` returns null) every operation degrades to a
 * no-op and `cached()` simply runs the loader. Cache failures are swallowed and
 * logged so a flaky Redis can never break a request — a miss just falls through
 * to the source of truth.
 *
 * Keys are namespaced under `cache:` and, for tenant-owned data, must lead with
 * the tenant id (see `tenantCacheKey`) so a single tenant's entries can be
 * invalidated as a group — mirroring the tenant-leading index rule.
 */
const NAMESPACE = 'cache:';

/** Build a namespaced, tenant-scoped cache key: `cache:t:<tenantId>:<...parts>`. */
export function tenantCacheKey(tenantId: string, ...parts: (string | number)[]): string {
  return `${NAMESPACE}t:${tenantId}:${parts.join(':')}`;
}

/** Glob prefix matching every cache key owned by a tenant (for invalidation). */
export function tenantCachePrefix(tenantId: string): string {
  return `${NAMESPACE}t:${tenantId}:`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.error(`cache get failed for ${key}`, err);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`cache set failed for ${key}`, err);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.error(`cache del failed`, err);
  }
}

/**
 * Delete every key under a prefix. Uses a non-blocking SCAN cursor (never
 * `KEYS`) so invalidation is safe against large keyspaces in production.
 */
export async function cacheDelByPrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
    const pending: Promise<unknown>[] = [];
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) pending.push(redis.del(...keys));
    }
    await Promise.all(pending);
  } catch (err) {
    logger.error(`cache delByPrefix failed for ${prefix}`, err);
  }
}

/**
 * Read-through cache: return the cached value for `key`, or run `loader`, store
 * its result (TTL `ttlSeconds`), and return it. With Redis absent this is just
 * `loader()`.
 */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds = env.CACHE_TTL_SECONDS,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
