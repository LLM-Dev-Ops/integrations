/**
 * Observability module for Google Artifact Registry integration.
 * Provides metrics, logging, and tracing support.
 * @module observability
 */

/**
 * Metric names for Artifact Registry operations.
 */
export const MetricNames = {
  // Request metrics
  REQUESTS_TOTAL: 'gar_requests_total',
  REQUEST_DURATION_MS: 'gar_request_duration_ms',
  REQUEST_SIZE_BYTES: 'gar_request_size_bytes',
  RESPONSE_SIZE_BYTES: 'gar_response_size_bytes',

  // Operation metrics
  OPERATIONS_TOTAL: 'gar_operations_total',
  OPERATION_DURATION_MS: 'gar_operation_duration_ms',

  // Error metrics
  ERRORS_TOTAL: 'gar_errors_total',

  // Auth metrics
  TOKEN_REFRESH_TOTAL: 'gar_token_refresh_total',
  TOKEN_REFRESH_DURATION_MS: 'gar_token_refresh_duration_ms',

  // Docker metrics
  MANIFEST_PULLS_TOTAL: 'gar_manifest_pulls_total',
  MANIFEST_PUSHES_TOTAL: 'gar_manifest_pushes_total',
  BLOB_UPLOADS_TOTAL: 'gar_blob_uploads_total',
  BLOB_DOWNLOADS_TOTAL: 'gar_blob_downloads_total',
  BLOB_SIZE_BYTES: 'gar_blob_size_bytes',

  // Vulnerability metrics
  VULNERABILITIES_TOTAL: 'gar_vulnerabilities_total',
  VULNERABILITIES_BY_SEVERITY: 'gar_vulnerabilities_by_severity',
} as const;

/**
 * Labels for metrics.
 */
export interface MetricLabels {
  /** Operation name */
  operation?: string;
  /** GCP project ID */
  project?: string;
  /** Repository location */
  location?: string;
  /** Repository name */
  repository?: string;
  /** Image name */
  image?: string;
  /** HTTP status code */
  status?: number;
  /** Error kind */
  errorKind?: string;
  /** Success/failure */
  success?: boolean;
}

/**
 * Metric collector interface.
 */
export interface MetricCollector {
  /** Increments a counter */
  incrementCounter(name: string, labels?: MetricLabels, value?: number): void;
  /** Records a histogram value */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void;
  /** Sets a gauge value */
  setGauge(name: string, value: number, labels?: MetricLabels): void;
}

/**
 * Logger interface.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Span context for tracing.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Tracer interface.
 */
export interface Tracer {
  /** Starts a new span */
  startSpan(name: string, options?: { parent?: SpanContext }): Span;
  /** Gets the current span context */
  getCurrentSpan(): Span | undefined;
}

/**
 * Span interface for tracing.
 */
export interface Span {
  /** Span context */
  context: SpanContext;
  /** Sets an attribute on the span */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Sets the span status */
  setStatus(code: 'OK' | 'ERROR', message?: string): void;
  /** Records an exception */
  recordException(error: Error): void;
  /** Ends the span */
  end(): void;
}

/**
 * No-op metric collector for when metrics are disabled.
 */
export class NoOpMetricCollector implements MetricCollector {
  incrementCounter(): void {}
  recordHistogram(): void {}
  setGauge(): void {}
}

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;
  private readonly minLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(options?: { prefix?: string; minLevel?: 'debug' | 'info' | 'warn' | 'error' }) {
    this.prefix = options?.prefix ?? '[GAR]';
    this.minLevel = options?.minLevel ?? 'info';
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${this.prefix} [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.format('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message, context));
    }
  }
}

/**
 * No-op logger for when logging is disabled.
 */
export class NoOpLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * No-op tracer for when tracing is disabled.
 */
export class NoOpTracer implements Tracer {
  startSpan(_name: string): Span {
    return new NoOpSpan();
  }

  getCurrentSpan(): Span | undefined {
    return undefined;
  }
}

/**
 * No-op span implementation.
 */
class NoOpSpan implements Span {
  context: SpanContext = {
    traceId: '00000000000000000000000000000000',
    spanId: '0000000000000000',
  };

  setAttribute(): void {}
  setStatus(): void {}
  recordException(): void {}
  end(): void {}
}

/**
 * Simple in-memory metric collector for development/testing.
 */
export class InMemoryMetricCollector implements MetricCollector {
  private readonly counters: Map<string, number> = new Map();
  private readonly histograms: Map<string, number[]> = new Map();
  private readonly gauges: Map<string, number> = new Map();

  private makeKey(name: string, labels?: MetricLabels): string {
    const labelStr = labels
      ? Object.entries(labels)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .sort()
          .join(',')
      : '';
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  incrementCounter(name: string, labels?: MetricLabels, value: number = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  setGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  /** Gets all counter values */
  getCounters(): Map<string, number> {
    return new Map(this.counters);
  }

  /** Gets all histogram values */
  getHistograms(): Map<string, number[]> {
    return new Map(this.histograms);
  }

  /** Gets all gauge values */
  getGauges(): Map<string, number> {
    return new Map(this.gauges);
  }

  /** Resets all metrics */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

/**
 * Observability configuration.
 */
export interface ObservabilityConfig {
  /** Metric collector */
  metrics?: MetricCollector;
  /** Logger */
  logger?: Logger;
  /** Tracer */
  tracer?: Tracer;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Global observability instance.
 */
let globalObservability: ObservabilityConfig = {
  metrics: new NoOpMetricCollector(),
  logger: new NoOpLogger(),
  tracer: new NoOpTracer(),
};

/**
 * Configures global observability.
 */
export function configureObservability(config: ObservabilityConfig): void {
  globalObservability = {
    metrics: config.metrics ?? new NoOpMetricCollector(),
    logger: config.logger ?? (config.debug ? new ConsoleLogger({ minLevel: 'debug' }) : new NoOpLogger()),
    tracer: config.tracer ?? new NoOpTracer(),
  };
}

/**
 * Gets the global observability configuration.
 */
export function getObservability(): ObservabilityConfig {
  return globalObservability;
}

/**
 * Gets the global metric collector.
 */
export function getMetrics(): MetricCollector {
  return globalObservability.metrics ?? new NoOpMetricCollector();
}

/**
 * Gets the global logger.
 */
export function getLogger(): Logger {
  return globalObservability.logger ?? new NoOpLogger();
}

/**
 * Gets the global tracer.
 */
export function getTracer(): Tracer {
  return globalObservability.tracer ?? new NoOpTracer();
}

/**
 * Utility to time an operation and record metrics.
 */
export async function withMetrics<T>(
  operation: string,
  labels: MetricLabels,
  fn: () => Promise<T>
): Promise<T> {
  const metrics = getMetrics();
  const start = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - start;

    metrics.incrementCounter(MetricNames.OPERATIONS_TOTAL, { ...labels, operation, success: true });
    metrics.recordHistogram(MetricNames.OPERATION_DURATION_MS, duration, { ...labels, operation });

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    metrics.incrementCounter(MetricNames.OPERATIONS_TOTAL, { ...labels, operation, success: false });
    metrics.incrementCounter(MetricNames.ERRORS_TOTAL, {
      ...labels,
      operation,
      errorKind: error instanceof Error ? error.name : 'unknown',
    });
    metrics.recordHistogram(MetricNames.OPERATION_DURATION_MS, duration, { ...labels, operation });

    throw error;
  }
}

/**
 * Utility to create a traced span for an operation.
 */
export async function withTracing<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  try {
    const result = await fn(span);
    span.setStatus('OK');
    return result;
  } catch (error) {
    span.setStatus('ERROR', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}
