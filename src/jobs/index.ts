import { env } from '../config/env';
import { logger } from '../utils/logger';
import { startScheduler, stopScheduler } from './scheduler';
import { startQueue, stopQueue } from './queue';

/**
 * Recurring-job entry point. Picks the runner per `JOB_RUNNER`:
 *   - `auto` (default): BullMQ when `REDIS_URL` is set, else in-process node-cron
 *   - `bullmq`: force BullMQ (requires `REDIS_URL`)
 *   - `cron`: force in-process node-cron
 * Set `ENABLE_SCHEDULER=false` to disable recurring jobs entirely (e.g. tests).
 */
type Runner = 'cron' | 'bullmq' | 'none';
let active: Runner = 'none';

function chooseRunner(): Runner {
  if (!env.ENABLE_SCHEDULER) return 'none';
  switch (env.JOB_RUNNER) {
    case 'cron':
      return 'cron';
    case 'bullmq':
      if (!env.REDIS_URL) {
        logger.warn('JOB_RUNNER=bullmq but REDIS_URL is unset — falling back to node-cron');
        return 'cron';
      }
      return 'bullmq';
    case 'auto':
    default:
      return env.REDIS_URL ? 'bullmq' : 'cron';
  }
}

export async function startJobs(): Promise<void> {
  active = chooseRunner();
  if (active === 'none') {
    logger.info('Recurring jobs disabled (ENABLE_SCHEDULER=false)');
    return;
  }
  if (active === 'bullmq') await startQueue();
  else startScheduler();
}

export async function stopJobs(): Promise<void> {
  if (active === 'bullmq') await stopQueue();
  else if (active === 'cron') stopScheduler();
  active = 'none';
}
