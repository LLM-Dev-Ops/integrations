/**
 * Observability utilities for Slack API.
 */

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: { level?: LogLevel; prefix?: string } = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? '[Slack]';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let log = `${timestamp} ${this.prefix} [${level.toUpperCase()}] ${message}`;
    if (context) {
      log += ` ${JSON.stringify(context)}`;
    }
    return log;
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
 * No-op logger
 */
export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}

/**
 * In-memory metrics collector
 */
export class InMemoryMetrics implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private timings: Map<string, number[]> = new Map();

  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}[${tagStr}]`;
  }

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.gauges.set(key, value);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const values = this.timings.get(key) ?? [];
    values.push(durationMs);
    this.timings.set(key, values);
  }

  /**
   * Get all metrics
   */
  getMetrics(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; min: number; max: number; avg: number }>;
    timings: Record<string, { count: number; min: number; max: number; avg: number; p95: number }>;
  } {
    const histogramStats = (values: number[]) => ({
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    });

    const timingStats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      return {
        ...histogramStats(values),
        p95: sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0,
      };
    };

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([k, v]) => [k, histogramStats(v)])
      ),
      timings: Object.fromEntries(
        Array.from(this.timings.entries()).map(([k, v]) => [k, timingStats(v)])
      ),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timings.clear();
  }
}

/**
 * No-op metrics collector
 */
export class NoopMetrics implements MetricsCollector {
  increment(): void {}
  gauge(): void {}
  histogram(): void {}
  timing(): void {}
}

/**
 * Trace span
 */
export interface Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>;
  status?: 'ok' | 'error';
  end(): void;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: 'ok' | 'error'): void;
}

/**
 * Simple span implementation
 */
export class SimpleSpan implements Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown> = {};
  events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }> = [];
  status?: 'ok' | 'error';

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }

  end(): void {
    this.endTime = Date.now();
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, time: Date.now(), attributes });
  }

  setStatus(status: 'ok' | 'error'): void {
    this.status = status;
  }

  getDuration(): number | undefined {
    if (this.endTime) {
      return this.endTime - this.startTime;
    }
    return undefined;
  }
}

/**
 * Tracer interface
 */
export interface Tracer {
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
}

/**
 * Simple tracer implementation
 */
export class SimpleTracer implements Tracer {
  private spans: SimpleSpan[] = [];
  private onSpanEnd?: (span: SimpleSpan) => void;

  constructor(options?: { onSpanEnd?: (span: SimpleSpan) => void }) {
    this.onSpanEnd = options?.onSpanEnd;
  }

  startSpan(name: string, attributes?: Record<string, unknown>): Span {
    const span = new SimpleSpan(name);
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }
    this.spans.push(span);

    // Wrap end to call callback
    const originalEnd = span.end.bind(span);
    span.end = () => {
      originalEnd();
      this.onSpanEnd?.(span);
    };

    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    const span = this.startSpan(name);
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error');
      span.setAttribute('error', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get all recorded spans
   */
  getSpans(): SimpleSpan[] {
    return this.spans;
  }

  /**
   * Clear spans
   */
  clearSpans(): void {
    this.spans = [];
  }
}

/**
 * No-op tracer
 */
export class NoopTracer implements Tracer {
  startSpan(): Span {
    return {
      name: '',
      startTime: 0,
      attributes: {},
      events: [],
      end: () => {},
      setAttribute: () => {},
      addEvent: () => {},
      setStatus: () => {},
    };
  }

  async withSpan<T>(_name: string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    return fn(this.startSpan(''));
  }
}

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  logger: Logger;
  metrics: MetricsCollector;
  tracer: Tracer;
}

/**
 * Create default observability config
 */
export function createObservability(options?: {
  logLevel?: LogLevel;
  enableMetrics?: boolean;
  enableTracing?: boolean;
}): ObservabilityConfig {
  return {
    logger: new ConsoleLogger({ level: options?.logLevel ?? 'info' }),
    metrics: options?.enableMetrics !== false ? new InMemoryMetrics() : new NoopMetrics(),
    tracer: options?.enableTracing !== false ? new SimpleTracer() : new NoopTracer(),
  };
}

/**
 * Create silent observability config (for testing)
 */
export function createSilentObservability(): ObservabilityConfig {
  return {
    logger: new NoopLogger(),
    metrics: new NoopMetrics(),
    tracer: new NoopTracer(),
  };
}
