/**
 * Observability components for Discord integration.
 *
 * Provides logging, metrics, and tracing interfaces following platform patterns.
 */

// ============================================================================
// Logging
// ============================================================================

/**
 * Log levels in order of severity.
 */
export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
}

/**
 * Logger interface.
 */
export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

/**
 * Sensitive fields to redact from logs.
 */
const SENSITIVE_FIELDS = new Set([
  'token',
  'bottoken',
  'bot_token',
  'authorization',
  'webhookurl',
  'webhook_url',
  'secret',
  'password',
]);

/**
 * Redacts sensitive fields from an object.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly context: Record<string, unknown>;
  private readonly format: 'json' | 'pretty';

  constructor(options: {
    level?: LogLevel;
    context?: Record<string, unknown>;
    format?: 'json' | 'pretty';
  } = {}) {
    this.level = options.level ?? LogLevel.Info;
    this.context = options.context ?? {};
    this.format = options.format ?? 'pretty';
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Trace, message, context);
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

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      level: this.level,
      context: { ...this.context, ...context },
      format: this.format,
    });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const mergedContext = redactSensitive({ ...this.context, ...context });
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level].toUpperCase();

    if (this.format === 'json') {
      const logObj = {
        timestamp,
        level: levelName,
        message,
        ...mergedContext,
      };
      console.log(JSON.stringify(logObj));
    } else {
      const contextStr = Object.keys(mergedContext).length > 0
        ? ` ${JSON.stringify(mergedContext)}`
        : '';
      console.log(`[${timestamp}] ${levelName}: ${message}${contextStr}`);
    }
  }
}

/**
 * No-op logger for testing or disabled logging.
 */
export class NoopLogger implements Logger {
  trace(): void { /* noop */ }
  debug(): void { /* noop */ }
  info(): void { /* noop */ }
  warn(): void { /* noop */ }
  error(): void { /* noop */ }
  child(): Logger { return this; }
}

/**
 * In-memory logger for testing.
 */
export class InMemoryLogger implements Logger {
  private logs: Array<{
    level: LogLevel;
    message: string;
    context: Record<string, unknown>;
    timestamp: Date;
  }> = [];
  private readonly context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.addLog(LogLevel.Trace, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.addLog(LogLevel.Debug, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.addLog(LogLevel.Info, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.addLog(LogLevel.Warn, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.addLog(LogLevel.Error, message, context);
  }

  child(context: Record<string, unknown>): Logger {
    const child = new InMemoryLogger({ ...this.context, ...context });
    // Share the logs array
    child.logs = this.logs;
    return child;
  }

  getLogs(): typeof this.logs {
    return [...this.logs];
  }

  getLogsByLevel(level: LogLevel): typeof this.logs {
    return this.logs.filter((log) => log.level === level);
  }

  clear(): void {
    this.logs = [];
  }

  private addLog(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      level,
      message,
      context: { ...this.context, ...context },
      timestamp: new Date(),
    });
  }
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Standard metric names for Discord integration.
 */
export const MetricNames = {
  /** Total API requests made */
  REQUESTS_TOTAL: 'discord_requests_total',
  /** Successful requests */
  REQUESTS_SUCCESS: 'discord_requests_success',
  /** Failed requests */
  REQUESTS_FAILED: 'discord_requests_failed',
  /** Rate limits hit */
  RATE_LIMITS_HIT: 'discord_rate_limits_hit',
  /** Request latency in seconds */
  REQUEST_LATENCY: 'discord_request_latency_seconds',
  /** Queue depth (pending requests) */
  QUEUE_DEPTH: 'discord_queue_depth',
  /** Retry attempts */
  RETRY_ATTEMPTS: 'discord_retry_attempts',
  /** Webhooks executed */
  WEBHOOKS_EXECUTED: 'discord_webhooks_executed',
  /** Messages sent */
  MESSAGES_SENT: 'discord_messages_sent',
} as const;

/**
 * No-op metrics collector.
 */
export class NoopMetricsCollector implements MetricsCollector {
  incrementCounter(): void { /* noop */ }
  recordHistogram(): void { /* noop */ }
  setGauge(): void { /* noop */ }
}

/**
 * In-memory metrics collector for testing.
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

  clear(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// ============================================================================
// Tracing
// ============================================================================

/**
 * Span status.
 */
export type SpanStatus = 'ok' | 'error' | 'unset';

/**
 * Span context interface.
 */
export interface SpanContext {
  spanId: string;
  traceId: string;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): void;
}

/**
 * Tracer interface.
 */
export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanContext;
  getCurrentSpan(): SpanContext | undefined;
}

/**
 * No-op span context.
 */
class NoopSpanContext implements SpanContext {
  spanId = '0000000000000000';
  traceId = '00000000000000000000000000000000';
  setAttribute(): void { /* noop */ }
  addEvent(): void { /* noop */ }
  setStatus(): void { /* noop */ }
  end(): void { /* noop */ }
}

/**
 * No-op tracer.
 */
export class NoopTracer implements Tracer {
  private readonly noopSpan = new NoopSpanContext();
  startSpan(): SpanContext { return this.noopSpan; }
  getCurrentSpan(): SpanContext | undefined { return undefined; }
}

/**
 * In-memory span for testing.
 */
export class InMemorySpanContext implements SpanContext {
  readonly spanId: string;
  readonly traceId: string;
  readonly name: string;
  readonly startTime: Date;
  endTime?: Date;
  status: SpanStatus = 'unset';
  statusMessage?: string;
  attributes: Record<string, string | number | boolean> = {};
  events: Array<{
    name: string;
    timestamp: Date;
    attributes?: Record<string, string | number | boolean>;
  }> = [];

  constructor(name: string, traceId: string, attributes?: Record<string, string | number | boolean>) {
    this.spanId = this.generateId(16);
    this.traceId = traceId;
    this.name = name;
    this.startTime = new Date();
    if (attributes) {
      this.attributes = { ...attributes };
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.events.push({ name, timestamp: new Date(), attributes });
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  end(): void {
    this.endTime = new Date();
  }

  getDurationMs(): number | undefined {
    if (!this.endTime) return undefined;
    return this.endTime.getTime() - this.startTime.getTime();
  }

  private generateId(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}

/**
 * In-memory tracer for testing.
 */
export class InMemoryTracer implements Tracer {
  private spans: InMemorySpanContext[] = [];
  private currentSpan?: InMemorySpanContext;
  private traceId: string;

  constructor() {
    this.traceId = this.generateTraceId();
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanContext {
    const span = new InMemorySpanContext(name, this.traceId, attributes);
    this.spans.push(span);
    this.currentSpan = span;
    return span;
  }

  getCurrentSpan(): SpanContext | undefined {
    return this.currentSpan;
  }

  getSpans(): InMemorySpanContext[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
    this.currentSpan = undefined;
    this.traceId = this.generateTraceId();
  }

  private generateTraceId(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}
