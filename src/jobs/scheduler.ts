import cron, { ScheduledTask } from 'node-cron';
import { JOB_RUNNERS, JOB_SCHEDULES } from './jobs';
import { logger } from '../utils/logger';

/**
 * In-process cron runner (design doc §10) — the lightweight, single-VPS path.
 * Used when Redis is unavailable or `JOB_RUNNER=cron`. For multi-worker
 * deploys with retries/concurrency, `queue.ts` runs the same jobs on BullMQ.
 */

const tasks: ScheduledTask[] = [];

export function startScheduler(): void {
  for (const { name, pattern } of JOB_SCHEDULES) {
    const runner = JOB_RUNNERS[name];
    tasks.push(
      cron.schedule(
        pattern,
        async () => {
          try {
            await runner();
          } catch (err) {
            logger.error(`[cron:${name}] failed`, err);
          }
        },
        { timezone: 'UTC' },
      ),
    );
  }
  logger.info(
    `node-cron scheduler started: ${JOB_SCHEDULES.map((s) => `${s.name}@'${s.pattern}'`).join(', ')} (UTC)`,
  );
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
