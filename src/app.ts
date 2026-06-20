import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit, { Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env, isProd } from './config/env';
import { getRedis } from './config/redis';
import { logger } from './utils/logger';
import api from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(isProd ? 'combined' : 'dev'));

  // Baseline API rate limiting (design doc §2 — gateway concern). Backed by
  // Redis when available so the limit is shared across processes; otherwise the
  // default in-memory store (per-process) is used.
  const redis = getRedis();
  let store: Store | undefined;
  if (redis) {
    // ioredis `call` wants a positional command arg; loosen it so the limiter
    // can forward its variadic command array.
    const sendCommand = (...args: string[]): Promise<never> =>
      (redis.call as unknown as (...a: string[]) => Promise<never>)(...args);
    store = new RedisStore({ prefix: 'rl:', sendCommand });
    logger.info('API rate limiting backed by Redis');
  }
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      ...(store ? { store } : {}),
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'welcome to Mediplus Server...!' });
  });

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
