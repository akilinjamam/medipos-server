import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Shared Redis client (design doc §2). Optional: only created when `REDIS_URL`
 * is set, so local/dev runs work without Redis. Today it backs the API rate
 * limiter; the same client is the intended home for the BullMQ queue + cache.
 */
let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      // Don't queue commands forever if Redis is unreachable.
      maxRetriesPerRequest: 3,
    });
    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err) => logger.error('Redis error', err));
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
