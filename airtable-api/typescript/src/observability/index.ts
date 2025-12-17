/**
 * Observability components for Airtable API client following SPARC specification.
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
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log entry for in-memory logger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Logger interface.
 */
export interface Logger {
  /** Log at debug level */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log at info level */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log at warn level */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log at error level */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Console logger implementation.
 * Logs to console with timestamp.
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
    this.redactKeys = new Set(options.redactKeys ?? ['token', 'apiKey', 'secret', 'password']);
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
 * Does nothing when methods are called.
 */
export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * In-memory logger for testing.
 * Stores log entries in an array.
 */
export class InMemoryLogger implements Logger {
  private readonly entries: LogEntry[] = [];
  private readonly context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
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

  private addEntry(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.entries.push({
      level,
      message,
      timestamp: new Date(),
      context: { ...this.context, ...context },
    });
  }

  /**
   * Gets all log entries.
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Gets entries at a specific level.
   */
  getEntriesAtLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  /**
   * Clears all entries.
   */
  clear(): void {
    this.entries.length = 0;
  }
}

// ============================================================================
// Metrics Interface
// ============================================================================

/**
 * Metric names for Airtable operations.
 */
export const MetricNames = {
  // Request metrics
  OPERATIONS_TOTAL: 'airtable_operations_total',
  OPERATION_LATENCY: 'airtable_operation_latency_ms',
  ERRORS_TOTAL: 'airtable_errors_total',

  // Record metrics
  RECORDS_CREATED: 'airtable_records_created_total',
  RECORDS_UPDATED: 'airtable_records_updated_total',
  RECORDS_DELETED: 'airtable_records_deleted_total',

  // Batch operation metrics
  BATCHES_PROCESSED: 'airtable_batches_processed_total',

  // Rate limit metrics
  RATE_LIMITS_HIT: 'airtable_rate_limits_hit_total',

  // Webhook metrics
  WEBHOOK_EVENTS: 'airtable_webhook_events_total',
  WEBHOOK_VERIFICATION_FAILURES: 'airtable_webhook_verification_failures_total',
} as const;

/**
 * Metric entry for in-memory collector.
 */
export interface MetricEntry {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  /**
   * Increment a counter.
   * @param name - Metric name
   * @param value - Value to increment by (default: 1)
   * @param labels - Optional metric labels
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge value.
   * @param name - Metric name
   * @param value - Gauge value
   * @param labels - Optional metric labels
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a timing value.
   * @param name - Metric name
   * @param durationMs - Duration in milliseconds
   * @param labels - Optional metric labels
   */
  timing(name: string, durationMs: number, labels?: Record<string, string>): void;
}

/**
 * No-op metrics collector for testing.
 * Does nothing when methods are called.
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(): void {}
  gauge(): void {}
  timing(): void {}
}

/**
 * In-memory metrics collector for testing.
 * Stores metric entries in an array.
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly entries: MetricEntry[] = [];
  private readonly counters: Map<string, number> = new Map();
  private readonly gauges: Map<string, number> = new Map();

  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    this.entries.push({ name, value, labels, timestamp: new Date() });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    this.entries.push({ name, value, labels, timestamp: new Date() });
  }

  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.entries.push({ name, value: durationMs, labels, timestamp: new Date() });
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${sortedLabels}}`;
  }

  /**
   * Gets all metric entries.
   */
  getMetrics(): MetricEntry[] {
    return [...this.entries];
  }

  /**
   * Gets counter value.
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  /**
   * Gets gauge value.
   */
  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

  /**
   * Clears all entries.
   */
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
export type SpanStatus = 'OK' | 'ERROR';

/**
 * Span context interface.
 */
export interface SpanContext {
  /**
   * Set an attribute on the span.
   * @param key - Attribute key
   * @param value - Attribute value
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Set the span status.
   * @param status - Span status
   */
  setStatus(status: SpanStatus): void;

  /**
   * Record an exception on the span.
   * @param error - Error to record
   */
  recordException(error: Error): void;
}

/**
 * Tracer interface.
 */
export interface Tracer {
  /**
   * Execute a function within a span.
   * @param name - Span name
   * @param fn - Function to execute
   * @param attributes - Optional span attributes
   * @returns Promise that resolves to the function's return value
   */
  withSpan<T>(
    name: string,
    fn: (span: SpanContext) => Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T>;
}

/**
 * No-op tracer for testing.
 * Executes function without tracing.
 */
export class NoopTracer implements Tracer {
  private readonly noopSpan: SpanContext = {
    setAttribute: () => {},
    setStatus: () => {},
    recordException: () => {},
  };

  async withSpan<T>(
    _name: string,
    fn: (span: SpanContext) => Promise<T>,
    _attributes?: Record<string, unknown>
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
  status: SpanStatus = 'OK';
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

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  recordException(error: Error): void {
    this.exception = error;
    this.setStatus('ERROR');
  }

  /**
   * End the span.
   */
  end(): void {
    this.endTime = new Date();
  }

  /**
   * Gets duration in milliseconds.
   */
  getDurationMs(): number | undefined {
    if (!this.endTime) return undefined;
    return this.endTime.getTime() - this.startTime.getTime();
  }
}

/**
 * In-memory tracer for testing.
 * Stores span data.
 */
export class InMemoryTracer implements Tracer {
  private readonly spans: InMemorySpanContext[] = [];

  async withSpan<T>(
    name: string,
    fn: (span: SpanContext) => Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T> {
    const span = new InMemorySpanContext(name, attributes);
    this.spans.push(span);
    try {
      const result = await fn(span);
      if (span.status === 'OK') {
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

  /**
   * Gets all spans.
   */
  getSpans(): InMemorySpanContext[] {
    return [...this.spans];
  }

  /**
   * Gets spans by name.
   */
  getSpansByName(name: string): InMemorySpanContext[] {
    return this.spans.filter(s => s.name === name);
  }

  /**
   * Clears all spans.
   */
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
 * All components do nothing when called.
 * Useful for production when observability is disabled.
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
 * All components store data in memory for inspection.
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
 * Logger outputs to console, other components are no-op.
 * @param level - Minimum log level (default: INFO)
 */
export function createConsoleObservability(level: LogLevel = LogLevel.INFO): Observability {
  return {
    logger: new ConsoleLogger({ level }),
    metrics: new NoopMetricsCollector(),
    tracer: new NoopTracer(),
  };
}
