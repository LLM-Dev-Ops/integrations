/**
 * Azure Cognitive Search Observability Module
 *
 * Provides logging, metrics, and tracing for Azure Cognitive Search operations.
 */

/** Log levels */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Logger interface */
export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

/** Metrics collector interface */
export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/** Span context for distributed tracing */
export interface SpanContext {
  spanId: string;
  traceId: string;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: 'ok' | 'error' | 'unset', message?: string): void;
  end(): void;
}

/** Tracer interface */
export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): SpanContext;
  getCurrentSpan(): SpanContext | undefined;
}

/** Standard metric names for Azure Cognitive Search operations */
export const MetricNames = {
  SEARCH_TOTAL: 'acs_search_total',
  SEARCH_LATENCY_SECONDS: 'acs_search_latency_seconds',
  DOCUMENTS_INDEXED_TOTAL: 'acs_documents_indexed_total',
  INDEX_LATENCY_SECONDS: 'acs_index_latency_seconds',
  ERRORS_TOTAL: 'acs_errors_total',
  RETRY_ATTEMPTS: 'acs_retry_attempts',
  CIRCUIT_BREAKER_STATE: 'acs_circuit_breaker_state',
} as const;

/** Sensitive fields that should be redacted in logs */
const SENSITIVE_FIELDS = ['apiKey', 'api-key', 'authorization', 'password', 'secret', 'token'];

/** Sanitize context by redacting sensitive fields */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/** Log level priority (lower = more important) */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/** Console logger implementation */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private context: Record<string, unknown>;

  constructor(level: LogLevel = 'info', context: Record<string, unknown> = {}) {
    this.level = level;
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...sanitizeContext(context ?? {}) };
    const contextStr = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [acs] ${message}${contextStr}`;
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  trace(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage('trace', message, context));
    }
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...context });
  }
}

/** No-op logger for when logging is disabled */
export class NoopLogger implements Logger {
  error(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
  debug(_message: string, _context?: Record<string, unknown>): void {}
  trace(_message: string, _context?: Record<string, unknown>): void {}
  child(_context: Record<string, unknown>): Logger {
    return this;
  }
}

/** In-memory logger for testing */
export class InMemoryLogger implements Logger {
  private logs: Array<{ level: LogLevel; message: string; context?: Record<string, unknown> }> = [];
  private contextData: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.contextData = context;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, context: { ...this.contextData, ...context } });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  child(context: Record<string, unknown>): Logger {
    return new InMemoryLogger({ ...this.contextData, ...context });
  }

  getLogs(): Array<{ level: LogLevel; message: string; context?: Record<string, unknown> }> {
    return [...this.logs];
  }

  getLogsByLevel(level: LogLevel): Array<{ message: string; context?: Record<string, unknown> }> {
    return this.logs
      .filter((log) => log.level === level)
      .map(({ message, context }) => ({ message, context }));
  }

  clear(): void {
    this.logs = [];
  }
}

/** In-memory metrics collector for testing */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const existing = this.histograms.get(key) ?? [];
    existing.push(value);
    this.histograms.set(key, existing);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.makeKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): number[] {
    const key = this.makeKey(name, labels);
    return this.histograms.get(key) ?? [];
  }

  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    const key = this.makeKey(name, labels);
    return this.gauges.get(key);
  }

  clear(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

/** No-op metrics collector */
export class NoopMetricsCollector implements MetricsCollector {
  incrementCounter(_name: string, _value?: number, _labels?: Record<string, string>): void {}
  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {}
  setGauge(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/** No-op tracer */
export class NoopTracer implements Tracer {
  private noopSpan: SpanContext = {
    spanId: '',
    traceId: '',
    setAttribute: () => {},
    addEvent: () => {},
    setStatus: () => {},
    end: () => {},
  };

  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): SpanContext {
    return this.noopSpan;
  }

  getCurrentSpan(): SpanContext | undefined {
    return undefined;
  }
}

/** Create a console logger */
export function createConsoleLogger(level: LogLevel = 'info'): Logger {
  return new ConsoleLogger(level);
}

/** Create a no-op logger */
export function createNoopLogger(): Logger {
  return new NoopLogger();
}

/** Create an in-memory logger for testing */
export function createInMemoryLogger(): InMemoryLogger {
  return new InMemoryLogger();
}

/** Create a no-op metrics collector */
export function createNoopMetricsCollector(): MetricsCollector {
  return new NoopMetricsCollector();
}

/** Create an in-memory metrics collector for testing */
export function createInMemoryMetricsCollector(): InMemoryMetricsCollector {
  return new InMemoryMetricsCollector();
}

/** Create a no-op tracer */
export function createNoopTracer(): Tracer {
  return new NoopTracer();
}
