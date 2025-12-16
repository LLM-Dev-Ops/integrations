/**
 * HTTP module - Handlers, middleware, and utilities for serving metrics.
 */

export { compressIfNeeded, acceptsGzip } from './compression';
export { ResponseCache, CachedResponse } from './cache';
export {
  MetricsHandler,
  MetricsRequest,
  MetricsResponse,
  HandlerConfig
} from './handler';
export { handleHealth, handleReady, HealthResponse } from './health';
export { createExpressMiddleware, createFastifyHandler } from './middleware';
