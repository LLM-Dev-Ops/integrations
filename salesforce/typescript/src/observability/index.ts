/**
 * Observability components for Salesforce client following SPARC specification.
 *
 * Provides logging, metrics, and tracing interfaces with pluggable implementations.
 */

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Log levels.
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

/**
 * Logger interface.
 */
export interface Logger {
  /** Log at trace level */
  trace(message: string, context?: Record<string, unknown>): void;
  /** Log at debug level */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log at info level */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log at warn level */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log at error level */
  error(message: string, context?: Record<string, unknown>): void;
  /** Create a child logger with additional context */
  child(context: Record<string, unknown>): Logger;
}

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly context: Record<string, unknown>;
  private readonly redactKeys: Set<string>;

  constructor(options: {
    level?: LogLevel;
    context?: Record<string, unknown>;
    redactKeys?: string[];
  } = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.context = options.context ?? {};
    this.redactKeys = new Set(options.redactKeys ?? [
      'token',
      'secret',
      'password',
      'apiKey',
      'accessToken',
      'refreshToken',
      'clientSecret',
      'privateKey',
    ]);
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      level: this.level,
      context: { ...this.context, ...context },
      redactKeys: Array.from(this.redactKeys),
    });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const mergedContext = this.redact({ ...this.context, ...context });

    const output = {
      timestamp,
      level: levelName,
      message,
      ...(Object.keys(mergedContext).length > 0 ? { context: mergedContext } : {}),
    };

    switch (level) {
      case LogLevel.ERROR:
        console.error(JSON.stringify(output));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(output));
        break;
      default:
        console.log(JSON.stringify(output));
    }
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.redactKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

/**
 * No-op logger for testing.
 */
export class NoopLogger implements Logger {
  trace(): void {}
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this;
  }
}

/**
 * In-memory logger for testing.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

export class InMemoryLogger implements Logger {
  private readonly entries: LogEntry[] = [];
  private readonly context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.addEntry(LogLevel.TRACE, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.addEntry(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.addEntry(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.addEntry(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.addEntry(LogLevel.ERROR, message, context);
  }

  child(context: Record<string, unknown>): Logger {
    const childLogger = new InMemoryLogger({ ...this.context, ...context });
    // Share entries array with child
    (childLogger as any).entries = this.entries;
    return childLogger;
  }

  private addEntry(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.entries.push({
      level,
      message,
      context: { ...this.context, ...context },
      timestamp: new Date(),
    });
  }

  /** Gets all log entries */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** Gets entries at a specific level */
  getEntriesAtLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  /** Clears all entries */
  clear(): void {
    this.entries.length = 0;
  }
}

// ============================================================================
// Metrics Interface
// ============================================================================

/**
 * Metric names for Salesforce operations.
 */
export const MetricNames = {
  // Request metrics
  REQUESTS_TOTAL: 'salesforce_requests_total',
  REQUEST_LATENCY: 'salesforce_request_latency_seconds',
  ERRORS_TOTAL: 'salesforce_errors_total',
  OPERATIONS_TOTAL: 'salesforce_operations_total',
  OPERATION_LATENCY: 'salesforce_operation_latency_seconds',

  // Record CRUD metrics
  RECORDS_CREATED: 'salesforce_records_created_total',
  RECORDS_UPDATED: 'salesforce_records_updated_total',
  RECORDS_DELETED: 'salesforce_records_deleted_total',
  RECORDS_QUERIED: 'salesforce_records_queried_total',

  // Bulk API metrics
  BULK_JOBS_TOTAL: 'salesforce_bulk_jobs_total',
  BULK_RECORDS_PROCESSED: 'salesforce_bulk_records_processed_total',
  BULK_JOB_LATENCY: 'salesforce_bulk_job_latency_seconds',
  BULK_BATCHES_TOTAL: 'salesforce_bulk_batches_total',

  // Event/Platform Event metrics
  EVENTS_PUBLISHED: 'salesforce_events_published_total',
  EVENTS_RECEIVED: 'salesforce_events_received_total',
  EVENT_PUBLISH_LATENCY: 'salesforce_event_publish_latency_seconds',

  // Authentication metrics
  TOKEN_REFRESH_TOTAL: 'salesforce_token_refresh_total',
  TOKEN_REFRESH_LATENCY: 'salesforce_token_refresh_latency_seconds',
  AUTH_FAILURES_TOTAL: 'salesforce_auth_failures_total',

  // Rate limit metrics
  RATE_LIMIT_HITS: 'salesforce_rate_limit_hits_total',
  API_LIMIT_USAGE: 'salesforce_api_limit_usage',
  API_LIMIT_REMAINING: 'salesforce_api_limit_remaining',
  RATE_LIMITER_QUEUE_SIZE: 'salesforce_rate_limiter_queue_size',

  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'salesforce_circuit_breaker_state',
  CIRCUIT_BREAKER_TRIPS: 'salesforce_circuit_breaker_trips_total',

  // SOQL query metrics
  SOQL_QUERIES_TOTAL: 'salesforce_soql_queries_total',
  SOQL_QUERY_LATENCY: 'salesforce_soql_query_latency_seconds',

  // Composite API metrics
  COMPOSITE_REQUESTS_TOTAL: 'salesforce_composite_requests_total',
  COMPOSITE_SUBREQUESTS_TOTAL: 'salesforce_composite_subrequests_total',

  // Metadata API metrics
  METADATA_OPERATIONS_TOTAL: 'salesforce_metadata_operations_total',
  METADATA_DEPLOYMENTS_TOTAL: 'salesforce_metadata_deployments_total',
} as const;

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  /** Increment a counter */
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  /** Set a gauge value */
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  /** Record a histogram value */
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  /** Record a timing value */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}

/**
 * No-op metrics collector for testing.
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(): void {}
  gauge(): void {}
  histogram(): void {}
  timing(): void {}
}

/**
 * Metric entry for in-memory collector.
 */
export interface MetricEntry {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timing';
  value: number;
  tags?: Record<string, string>;
  timestamp: Date;
}

/**
 * In-memory metrics collector for testing.
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly entries: MetricEntry[] = [];
  private readonly counters: Map<string, number> = new Map();
  private readonly gauges: Map<string, number> = new Map();

  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.makeKey(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    this.entries.push({ name, type: 'counter', value, tags, timestamp: new Date() });
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.makeKey(name, tags);
    this.gauges.set(key, value);
    this.entries.push({ name, type: 'gauge', value, tags, timestamp: new Date() });
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.entries.push({ name, type: 'histogram', value, tags, timestamp: new Date() });
  }

  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.entries.push({ name, type: 'timing', value: durationMs, tags, timestamp: new Date() });
  }

  private makeKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) return name;
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${sortedTags}}`;
  }

  /** Gets all metric entries */
  getEntries(): MetricEntry[] {
    return [...this.entries];
  }

  /** Gets counter value */
  getCounter(name: string, tags?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, tags)) ?? 0;
  }

  /** Gets gauge value */
  getGauge(name: string, tags?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, tags));
  }

  /** Clears all entries */
  clear(): void {
    this.entries.length = 0;
    this.counters.clear();
    this.gauges.clear();
  }
}

// ============================================================================
// Tracer Interface
// ============================================================================

/**
 * Span status.
 */
export type SpanStatus = 'OK' | 'ERROR' | 'UNSET';

/**
 * Span context interface.
 */
export interface SpanContext {
  /** Set span status */
  setStatus(status: SpanStatus, message?: string): void;
  /** Set an attribute */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Record an event */
  recordEvent(name: string, attributes?: Record<string, unknown>): void;
  /** Record an exception */
  recordException(error: Error): void;
  /** End the span */
  end(): void;
}

/**
 * Tracer interface.
 */
export interface Tracer {
  /** Start a new span */
  startSpan(name: string, attributes?: Record<string, unknown>): SpanContext;
  /** Execute a function within a span */
  withSpan<T>(
    name: string,
    fn: (span: SpanContext) => T | Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T>;
}

/**
 * No-op tracer for testing.
 */
export class NoopTracer implements Tracer {
  private readonly noopSpan: SpanContext = {
    setStatus: () => {},
    setAttribute: () => {},
    recordEvent: () => {},
    recordException: () => {},
    end: () => {},
  };

  startSpan(): SpanContext {
    return this.noopSpan;
  }

  async withSpan<T>(
    _name: string,
    fn: (span: SpanContext) => T | Promise<T>
  ): Promise<T> {
    return fn(this.noopSpan);
  }
}

/**
 * In-memory span context for testing.
 */
export class InMemorySpanContext implements SpanContext {
  readonly name: string;
  readonly attributes: Record<string, string | number | boolean> = {};
  readonly events: Array<{ name: string; attributes?: Record<string, unknown>; timestamp: Date }> = [];
  status: SpanStatus = 'UNSET';
  statusMessage?: string;
  exception?: Error;
  startTime: Date;
  endTime?: Date;

  constructor(name: string, attributes?: Record<string, unknown>) {
    this.name = name;
    this.startTime = new Date();
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          this.attributes[key] = value;
        }
      }
    }
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  recordEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, attributes, timestamp: new Date() });
  }

  recordException(error: Error): void {
    this.exception = error;
    this.setStatus('ERROR', error.message);
  }

  end(): void {
    this.endTime = new Date();
  }

  /** Gets duration in milliseconds */
  getDurationMs(): number | undefined {
    if (!this.endTime) return undefined;
    return this.endTime.getTime() - this.startTime.getTime();
  }
}

/**
 * In-memory tracer for testing.
 */
export class InMemoryTracer implements Tracer {
  private readonly spans: InMemorySpanContext[] = [];

  startSpan(name: string, attributes?: Record<string, unknown>): SpanContext {
    const span = new InMemorySpanContext(name, attributes);
    this.spans.push(span);
    return span;
  }

  async withSpan<T>(
    name: string,
    fn: (span: SpanContext) => T | Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T> {
    const span = this.startSpan(name, attributes) as InMemorySpanContext;
    try {
      const result = await fn(span);
      if (span.status === 'UNSET') {
        span.setStatus('OK');
      }
      return result;
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /** Gets all spans */
  getSpans(): InMemorySpanContext[] {
    return [...this.spans];
  }

  /** Gets spans by name */
  getSpansByName(name: string): InMemorySpanContext[] {
    return this.spans.filter(s => s.name === name);
  }

  /** Clears all spans */
  clear(): void {
    this.spans.length = 0;
  }
}

// ============================================================================
// Observability Container
// ============================================================================

/**
 * Container for all observability components.
 */
export interface Observability {
  logger: Logger;
  metrics: MetricsCollector;
  tracer: Tracer;
}

/**
 * Creates a no-op observability container.
 */
export function createNoopObservability(): Observability {
  return {
    logger: new NoopLogger(),
    metrics: new NoopMetricsCollector(),
    tracer: new NoopTracer(),
  };
}

/**
 * Creates an in-memory observability container for testing.
 */
export function createInMemoryObservability(): Observability & {
  logger: InMemoryLogger;
  metrics: InMemoryMetricsCollector;
  tracer: InMemoryTracer;
} {
  return {
    logger: new InMemoryLogger(),
    metrics: new InMemoryMetricsCollector(),
    tracer: new InMemoryTracer(),
  };
}

/**
 * Creates a console-based observability container.
 */
export function createConsoleObservability(level: LogLevel = LogLevel.INFO): Observability {
  return {
    logger: new ConsoleLogger({ level }),
    metrics: new NoopMetricsCollector(), // Console doesn't support metrics by default
    tracer: new NoopTracer(),
  };
}
