import { Queue, Worker, Job, JobsOptions } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { JOB_RUNNERS, JOB_SCHEDULES, JobName } from './jobs';

/**
 * Distributed job runner (design doc §2, §10) on BullMQ + Redis. Replaces the
 * in-process node-cron path when Redis is available, adding retries and
 * cross-worker concurrency. The recurring jobs are registered as BullMQ
 * repeatable jobs from the shared `JOB_SCHEDULES`; a single Worker in this
 * process executes them via `JOB_RUNNERS`.
 *
 * BullMQ needs a dedicated ioredis connection with `maxRetriesPerRequest: null`
 * (the shared client in `config/redis.ts` caps retries, which BullMQ rejects for
 * its blocking commands), so we create our own here.
 */
const QUEUE_NAME = 'medipos-jobs';

let connection: Redis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL as string, { maxRetriesPerRequest: null });
    connection.on('error', (err) => logger.error('BullMQ Redis error', err));
  }
  return connection;
}

const REPEATABLE_OPTS: JobsOptions = {
  // Retry transient failures with backoff; keep history bounded.
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: 50,
  removeOnFail: 100,
};

export async function startQueue(): Promise<void> {
  const conn = getConnection();
  queue = new Queue(QUEUE_NAME, { connection: conn });

  // Register (idempotently) one repeatable job per schedule. BullMQ dedupes
  // repeatable jobs by their repeat key, so re-registering on each boot is safe.
  for (const { name, pattern } of JOB_SCHEDULES) {
    await queue.add(name, {}, { ...REPEATABLE_OPTS, repeat: { pattern, tz: 'UTC' } });
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const runner = JOB_RUNNERS[job.name as JobName];
      if (!runner) throw new Error(`Unknown job: ${job.name}`);
      await runner();
    },
    { connection: conn, concurrency: env.JOB_CONCURRENCY },
  );

  worker.on('failed', (job, err) => logger.error(`[bullmq:${job?.name}] failed`, err));
  worker.on('completed', (job) => logger.info(`[bullmq:${job.name}] completed`));

  logger.info(
    `BullMQ runner started: ${JOB_SCHEDULES.map((s) => `${s.name}@'${s.pattern}'`).join(', ')} (UTC), concurrency ${env.JOB_CONCURRENCY}`,
  );
}

export async function stopQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  await connection?.quit();
  worker = null;
  queue = null;
  connection = null;
}
