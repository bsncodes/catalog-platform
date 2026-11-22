import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logger.js';
import { AppError, ProviderError, providerErrorToAppError } from '../errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
    }
  }
}

const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function correlationMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const supplied = req.header('x-correlation-id');
    req.correlationId = supplied && CORRELATION_PATTERN.test(supplied) ? supplied : randomUUID();
    req.log = logger.child({ correlationId: req.correlationId });
    res.setHeader('X-Correlation-ID', req.correlationId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const level = req.path.startsWith('/health/') ? 'debug' : 'info';
      req.log[level](
        { method: req.method, path: req.route ? `${req.baseUrl}${String(req.route.path)}` : req.path, status: res.statusCode, durationMs },
        'request completed',
      );
    });
    next();
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'The requested resource does not exist.', requestId: req.correlationId } });
}

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;
  const parserError = err as BodyParserError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ProviderError) {
    appError = providerErrorToAppError(err);
  } else if (parserError?.type === 'entity.parse.failed') {
    appError = new AppError(400, 'MALFORMED_JSON', 'The request body is not valid JSON.');
  } else if (parserError?.type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  } else {
    appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }

  const logContext = { errorCode: appError.code, status: appError.status, err: err instanceof Error ? { name: err.name, message: err.message, cause: describeCause(err.cause) } : undefined };
  if (appError.status >= 500) req.log?.error(logContext, 'request failed');
  else req.log?.warn(logContext, 'request rejected');

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      requestId: req.correlationId,
      ...(appError.details ? { details: appError.details } : {}),
    },
  });
}

function describeCause(cause: unknown): string | undefined {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return cause === undefined ? undefined : String(cause);
}
