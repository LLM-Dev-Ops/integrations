/**
 * Logging module exports
 * Provides log-trace correlation for Datadog APM
 */

export type { LogContext, ExtendedLogContext } from './context.js';
export { createLogContext, mergeLogContext } from './context.js';
export {
  getLogContextFromSpan,
  getLogContextFromSpanContext,
  injectTraceContext,
  extractCorrelationIds,
} from './correlation.js';
export { CorrelatedLogger } from './logger.js';
export type { LogContextProvider } from './logger.js';