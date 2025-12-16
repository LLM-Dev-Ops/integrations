/**
 * Observability components for the Weaviate client.
 *
 * Includes tracing, metrics, logging, and health checks.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  Span,
  SpanStatus,
  Tracer,
  MetricValue,
  MetricsCollector,
  Logger,
  LogEntry,
  HealthCheck,
  HealthCheckResult,
  ComponentHealth,
  ObservabilityContext,
} from './types';

export { LogLevel, HealthStatus, MetricNames, SpanNames, SpanAttributes } from './types';

// ============================================================================
// Tracer
// ============================================================================

export { NoopTracer, ConsoleTracer, TracerSpan, createTracer } from './tracer';

// ============================================================================
// Metrics
// ============================================================================

export {
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  createMetricsCollector,
} from './metrics';

// ============================================================================
// Logger
// ============================================================================

export type { ConsoleLoggerOptions } from './logger';

export { NoopLogger, ConsoleLogger, createLogger, createLogContext } from './logger';

// ============================================================================
// Context
// ============================================================================

export {
  createDefaultObservability,
  createDevObservability,
  createProductionObservability,
  createTestObservability,
  createCustomObservability,
  combineObservability,
  createObservabilityFromEnv,
} from './context';

// ============================================================================
// Health
// ============================================================================

export type { HealthCheckOptions } from './health';

export {
  WeaviateHealthCheck,
  createHealthCheck,
  isHealthy,
  formatHealthCheckResult,
} from './health';
