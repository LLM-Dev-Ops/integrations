/**
 * Observability layer exports for tracing, metrics, and logging
 */

// Tracing exports
export {
  type RequestSpan,
  type SpanStatus,
  type Tracer,
  createSpan,
  withParent,
  withAttribute,
  finishSpan,
  finishSpanWithError,
  getSpanDuration,
  DefaultTracer,
  NoopTracer,
} from './tracing.js';

// Metrics exports
export {
  type MetricsCollector,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
} from './metrics.js';

// Logging exports
export {
  type LogLevel,
  type LogFormat,
  type LoggingConfig,
  type Logger,
  createDefaultLoggingConfig,
  ConsoleLogger,
  NoopLogger,
  logRequest,
  logResponse,
  logError,
} from './logging.js';
