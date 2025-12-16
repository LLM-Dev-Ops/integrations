/**
 * Observability context factory functions.
 *
 * Provides functions to create different observability configurations.
 */

import { ObservabilityContext, LogLevel } from './types';
import { NoopTracer, ConsoleTracer, createTracer } from './tracer';
import { NoopMetricsCollector, InMemoryMetricsCollector, createMetricsCollector } from './metrics';
import { NoopLogger, ConsoleLogger, createLogger } from './logger';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default observability context with no-op implementations
 *
 * This is the most performant option as it has zero overhead.
 * Use for production when you have external observability tools.
 */
export function createDefaultObservability(): ObservabilityContext {
  return {
    tracer: new NoopTracer(),
    metrics: new NoopMetricsCollector(),
    logger: new ConsoleLogger({ name: 'weaviate', level: LogLevel.Info }),
  };
}

/**
 * Create a development observability context with console-based implementations
 *
 * This enables full tracing, metrics collection, and debug logging.
 * Use for local development and debugging.
 */
export function createDevObservability(options?: {
  logLevel?: LogLevel;
  jsonLogs?: boolean;
}): ObservabilityContext {
  return {
    tracer: new ConsoleTracer(),
    metrics: new InMemoryMetricsCollector(),
    logger: new ConsoleLogger({
      name: 'weaviate',
      level: options?.logLevel ?? LogLevel.Debug,
      json: options?.jsonLogs ?? false,
    }),
  };
}

/**
 * Create a production observability context with selective enablement
 *
 * Allows fine-grained control over which observability features are enabled.
 */
export function createProductionObservability(options: {
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  logLevel?: LogLevel;
  jsonLogs?: boolean;
}): ObservabilityContext {
  return {
    tracer: options.enableTracing ? new ConsoleTracer() : new NoopTracer(),
    metrics: options.enableMetrics
      ? new InMemoryMetricsCollector()
      : new NoopMetricsCollector(),
    logger: options.enableLogging
      ? new ConsoleLogger({
          name: 'weaviate',
          level: options.logLevel ?? LogLevel.Info,
          json: options.jsonLogs ?? true,
        })
      : new NoopLogger(),
  };
}

/**
 * Create a testing observability context with in-memory implementations
 *
 * Captures all observability data in memory for assertions in tests.
 */
export function createTestObservability(): ObservabilityContext {
  return {
    tracer: new ConsoleTracer(),
    metrics: new InMemoryMetricsCollector(),
    logger: new ConsoleLogger({ name: 'weaviate', level: LogLevel.Debug }),
  };
}

/**
 * Create a custom observability context
 *
 * Allows complete customization of observability components.
 */
export function createCustomObservability(options: {
  tracer?: 'noop' | 'console';
  metrics?: 'noop' | 'memory';
  logger?: 'noop' | 'console';
  logLevel?: LogLevel;
  jsonLogs?: boolean;
}): ObservabilityContext {
  return {
    tracer: createTracer({
      enabled: options.tracer !== 'noop',
      type: options.tracer ?? 'noop',
    }),
    metrics: createMetricsCollector({
      enabled: options.metrics !== 'noop',
      type: options.metrics ?? 'noop',
    }),
    logger: createLogger({
      enabled: options.logger !== 'noop',
      type: options.logger ?? 'console',
      level: options.logLevel,
      json: options.jsonLogs,
    }),
  };
}

/**
 * Combine multiple observability contexts
 *
 * Creates a new context by merging components from multiple contexts.
 * Later contexts override earlier ones.
 */
export function combineObservability(
  ...contexts: Partial<ObservabilityContext>[]
): ObservabilityContext {
  const defaultContext = createDefaultObservability();

  const combined: ObservabilityContext = {
    tracer: defaultContext.tracer,
    metrics: defaultContext.metrics,
    logger: defaultContext.logger,
  };

  for (const context of contexts) {
    if (context.tracer) {
      combined.tracer = context.tracer;
    }
    if (context.metrics) {
      combined.metrics = context.metrics;
    }
    if (context.logger) {
      combined.logger = context.logger;
    }
  }

  return combined;
}

/**
 * Create an observability context from environment variables
 *
 * Reads configuration from environment variables:
 * - WEAVIATE_TRACING_ENABLED: Enable tracing (true/false)
 * - WEAVIATE_METRICS_ENABLED: Enable metrics (true/false)
 * - WEAVIATE_LOG_LEVEL: Log level (debug/info/warn/error)
 * - WEAVIATE_JSON_LOGS: Use JSON logs (true/false)
 */
export function createObservabilityFromEnv(): ObservabilityContext {
  const tracingEnabled = process.env.WEAVIATE_TRACING_ENABLED === 'true';
  const metricsEnabled = process.env.WEAVIATE_METRICS_ENABLED === 'true';
  const logLevelStr = process.env.WEAVIATE_LOG_LEVEL?.toLowerCase();
  const jsonLogs = process.env.WEAVIATE_JSON_LOGS === 'true';

  let logLevel = LogLevel.Info;
  if (logLevelStr === 'debug') logLevel = LogLevel.Debug;
  else if (logLevelStr === 'info') logLevel = LogLevel.Info;
  else if (logLevelStr === 'warn') logLevel = LogLevel.Warn;
  else if (logLevelStr === 'error') logLevel = LogLevel.Error;

  return {
    tracer: tracingEnabled ? new ConsoleTracer() : new NoopTracer(),
    metrics: metricsEnabled ? new InMemoryMetricsCollector() : new NoopMetricsCollector(),
    logger: new ConsoleLogger({
      name: 'weaviate',
      level: logLevel,
      json: jsonLogs,
    }),
  };
}
