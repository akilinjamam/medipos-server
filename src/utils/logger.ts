/* eslint-disable no-console */

/**
 * Minimal logger placeholder. Swap for pino/winston when structured logging is needed.
 */
export const logger = {
  info: (message: string, ...meta: unknown[]) => console.log(`[info] ${message}`, ...meta),
  warn: (message: string, ...meta: unknown[]) => console.warn(`[warn] ${message}`, ...meta),
  error: (message: string, ...meta: unknown[]) => console.error(`[error] ${message}`, ...meta),
};
