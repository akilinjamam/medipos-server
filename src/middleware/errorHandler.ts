/* eslint-disable @typescript-eslint/no-explicit-any */
import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { isProd } from '../config/env';
import { logger } from '../utils/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json({ error: { message: err.message, details: err.details } });
  }

  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: { message: 'Validation failed', details: err.flatten().fieldErrors } });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { message: err.message } });
  }

  // Duplicate key
  if ((err as { code?: number }).code === 11000) {
    return res
      .status(409)
      .json({ error: { message: 'Duplicate key', details: (err as any).keyValue } });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      ...(isProd ? {} : { stack: (err as Error).stack }),
    },
  });
};
