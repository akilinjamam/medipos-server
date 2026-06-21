/**
 * Test bootstrap. Runs before any module is imported, so it can populate the
 * env vars `config/env` validates at import time — without these the process
 * would `exit(1)`. `dotenv` won't override values already present here.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/medipos-test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';
// No Redis in unit tests — keeps the cache a no-op and the runner on node-cron.
process.env.REDIS_URL = '';
process.env.ENABLE_SCHEDULER = 'false';
