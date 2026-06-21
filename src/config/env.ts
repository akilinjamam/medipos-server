import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Public base URL of this API — used to build SSLCommerz callback/IPN URLs.
  APP_BASE_URL: z.string().default('http://localhost:5000'),

  // Redis (optional). When set, backs the API rate limiter, the read-through
  // cache, and the BullMQ job queue.
  REDIS_URL: z.string().optional(),

  // Default TTL (seconds) for the Redis read-through cache.
  CACHE_TTL_SECONDS: z.coerce.number().default(300),

  // Recurring-job runner: "auto" uses BullMQ when REDIS_URL is set and falls
  // back to in-process node-cron otherwise; "cron"/"bullmq" force one path.
  JOB_RUNNER: z.enum(['auto', 'cron', 'bullmq']).default('auto'),

  // BullMQ worker concurrency (jobs processed in parallel per worker process).
  JOB_CONCURRENCY: z.coerce.number().default(1),

  // SSLCommerz subscription payments (optional — falls back to a disabled gateway).
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWD: z.string().optional(),
  // Anything other than the literal "false" means sandbox (safe default).
  SSLCOMMERZ_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // AWS S3 for invoice/report PDFs (optional — falls back to local disk).
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  // Override the public URL base for uploaded objects (e.g. a CDN/CloudFront).
  S3_PUBLIC_BASE_URL: z.string().optional(),
  // Directory used by the local-disk storage fallback when S3 is unconfigured.
  LOCAL_STORAGE_DIR: z.string().default('storage'),

  // SMS gateway (optional — falls back to logging only).
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),

  // In-process cron scheduler. Set to "false" to disable (e.g. in tests).
  ENABLE_SCHEDULER: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
