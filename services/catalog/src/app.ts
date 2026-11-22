import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from './logger.js';
import type { Pool } from './db/pool.js';
import type { CatalogService } from './products/catalogService.js';
import type { EnquiryService } from './enquiries/enquiryService.js';
import { productRoutes } from './products/routes.js';
import { internalEnquiryRoutes, publicEnquiryRoutes } from './enquiries/routes.js';
import { correlationMiddleware, errorHandler, notFoundHandler } from './http/middleware.js';

export interface AppDependencies {
  logger: Logger;
  catalog: CatalogService;
  enquiries: Pick<EnquiryService, 'createEnquiry' | 'applyNotificationCallback'>;
  pool: Pick<Pool, 'query'>;
  enquiryRateLimitPerMinute: number;
  trustProxyHops: number;
}

/** Public API: served behind the API Gateway at /api/catalog. Contains no internal routes. */
export function createPublicApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.trustProxyHops);
  app.use(helmet());
  app.use(correlationMiddleware(deps.logger));
  app.use(express.json({ limit: '16kb' }));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/health/ready', async (_req, res) => {
    try {
      await deps.pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/catalog', productRoutes(deps.catalog));
  app.use('/api/catalog', publicEnquiryRoutes(deps.enquiries, deps.enquiryRateLimitPerMinute));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Internal API: separate listener on the private network only; never routed by the Gateway. */
export function createInternalApp(deps: Pick<AppDependencies, 'logger' | 'enquiries'> & { internalToken: string }): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(correlationMiddleware(deps.logger));
  app.use(express.json({ limit: '4kb' }));
  app.use('/internal/catalog', internalEnquiryRoutes(deps.enquiries, deps.internalToken));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
