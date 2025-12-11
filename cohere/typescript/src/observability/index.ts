/**
 * Observability components for the Cohere client.
 *
 * Includes tracing, metrics, and logging.
 */

// ============================================================================
// Tracing
// ============================================================================

/**
 * Span status
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Request span for distributed tracing
 */
export interface RequestSpan {
  /** Span ID */
  id: string;
  /** Parent span ID */
  parentId?: string;
  /** Trace ID */
  traceId: string;
  /** Operation name */
  name: string;
  /** Start time (ms since epoch) */
  startTime: number;
  /** End time (ms since epoch) */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Span status */
  status?: SpanStatus;
  /** Attributes */
  attributes: Record<string, string | number | boolean>;
  /** Events */
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan;

  /**
   * End a span
   */
  endSpan(span: RequestSpan, status?: SpanStatus): void;

  /**
   * Add an event to a span
   */
  addEvent(
    span: RequestSpan,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void;

  /**
   * Set span attributes
   */
  setAttributes(span: RequestSpan, attributes: Record<string, string | number | boolean>): void;

  /**
   * Get active span
   */
  getActiveSpan(): RequestSpan | undefined;
}

/**
 * No-op tracer implementation
 */
export class NoopTracer implements Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan {
    return {
      id: '',
      traceId: '',
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
    };
  }

  endSpan(_span: RequestSpan, _status?: SpanStatus): void {
    // No-op
  }

  addEvent(
    _span: RequestSpan,
    _name: string,
    _attributes?: Record<string, string | number | boolean>
  ): void {
    // No-op
  }

  setAttributes(
    _span: RequestSpan,
    _attributes: Record<string, string | number | boolean>
  ): void {
    // No-op
  }

  getActiveSpan(): RequestSpan | undefined {
    return undefined;
  }
}

/**
 * Console-based tracer for development
 */
export class ConsoleTracer implements Tracer {
  private activeSpan?: RequestSpan;
  private spanIdCounter = 0;
  private traceIdCounter = 0;

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan {
    const span: RequestSpan = {
      id: `span-${++this.spanIdCounter}`,
      traceId: this.activeSpan?.traceId ?? `trace-${++this.traceIdCounter}`,
      parentId: this.activeSpan?.id,
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
    };

    this.activeSpan = span;
    console.log(`[TRACE] Started span: ${name}`, { spanId: span.id, traceId: span.traceId });

    return span;
  }

  endSpan(span: RequestSpan, status: SpanStatus = 'ok'): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    console.log(`[TRACE] Ended span: ${span.name}`, {
      spanId: span.id,
      duration: span.duration,
      status,
    });

    if (this.activeSpan?.id === span.id) {
      this.activeSpan = undefined;
    }
  }

  addEvent(
    span: RequestSpan,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });

    console.log(`[TRACE] Event: ${name}`, { spanId: span.id, attributes });
  }

  setAttributes(span: RequestSpan, attributes: Record<string, string | number | boolean>): void {
    Object.assign(span.attributes, attributes);
  }

  getActiveSpan(): RequestSpan | undefined {
    return this.activeSpan;
  }
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Metric value type
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  /**
   * Increment a counter
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record request timing
   */
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void;

  /**
   * Get all metrics
   */
  getMetrics(): Map<string, MetricValue[]>;
}

/**
 * No-op metrics collector
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(_name: string, _value?: number, _labels?: Record<string, string>): void {
    // No-op
  }

  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  histogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  recordTiming(_name: string, _durationMs: number, _labels?: Record<string, string>): void {
    // No-op
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map();
  }
}

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private metrics = new Map<string, MetricValue[]>();
  private counters = new Map<string, number>();

  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);

    this.record(name, current + value, labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.histogram(`${name}_duration_ms`, durationMs, labels);
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map(this.metrics);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }

  private record(name: string, value: number, labels?: Record<string, string>): void {
    const values = this.metrics.get(name) ?? [];
    values.push({
      value,
      timestamp: Date.now(),
      labels,
    });
    this.metrics.set(name, values);
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log level
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.Info;
  private readonly name?: string;

  constructor(name?: string, level?: LogLevel) {
    this.name = name;
    if (level !== undefined) {
      this.level = level;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level]?.toUpperCase() ?? 'UNKNOWN';
    const prefix = this.name ? `[${this.name}]` : '';

    const logFn =
      level === LogLevel.Error
        ? console.error
        : level === LogLevel.Warn
          ? console.warn
          : level === LogLevel.Debug
            ? console.debug
            : console.log;

    if (context && Object.keys(context).length > 0) {
      // Redact sensitive values
      const safeContext = this.redactSensitive(context);
      logFn(`${timestamp} ${levelStr}${prefix} ${message}`, safeContext);
    } else {
      logFn(`${timestamp} ${levelStr}${prefix} ${message}`);
    }
  }

  private redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['apiKey', 'api_key', 'authorization', 'token', 'password', 'secret'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

// ============================================================================
// Observability Context
// ============================================================================

/**
 * Combined observability context
 */
export interface ObservabilityContext {
  tracer: Tracer;
  metrics: MetricsCollector;
  logger: Logger;
}

/**
 * Create a default observability context
 */
export function createDefaultObservability(): ObservabilityContext {
  return {
    tracer: new NoopTracer(),
    metrics: new NoopMetricsCollector(),
    logger: new ConsoleLogger('cohere'),
  };
}

/**
 * Create a development observability context with all logging enabled
 */
export function createDevObservability(): ObservabilityContext {
  return {
    tracer: new ConsoleTracer(),
    metrics: new InMemoryMetricsCollector(),
    logger: new ConsoleLogger('cohere', LogLevel.Debug),
  };
}
