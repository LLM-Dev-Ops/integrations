/**
 * Azure Active Directory Observability Module
 *
 * Provides logging, metrics, and tracing for Azure AD OAuth2 operations.
 * Following the SPARC specification for Azure AD integration.
 */

/**
 * Log levels.
 */
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/**
 * Logger interface.
 */
export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Span context for distributed tracing.
 */
export interface SpanContext {
  spanId: string;
  traceId: string;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: "ok" | "error" | "unset", message?: string): void;
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
 * Standard metric names for Azure AD operations.
 */
export const MetricNames = {
  TOKEN_ACQUISITIONS_TOTAL: "azure_ad_token_acquisitions_total",
  TOKEN_CACHE_HITS: "azure_ad_token_cache_hits",
  TOKEN_CACHE_MISSES: "azure_ad_token_cache_misses",
  TOKEN_REFRESH_TOTAL: "azure_ad_token_refresh_total",
  TOKEN_VALIDATION_TOTAL: "azure_ad_token_validation_total",
  LATENCY_SECONDS: "azure_ad_latency_seconds",
  ERRORS_TOTAL: "azure_ad_errors_total",
  RETRY_ATTEMPTS: "azure_ad_retry_attempts",
  CIRCUIT_BREAKER_STATE: "azure_ad_circuit_breaker_state",
} as const;

/**
 * Sensitive fields that should be redacted in logs.
 * CRITICAL: Never log tokens, secrets, or credentials.
 */
const SENSITIVE_FIELDS = [
  "accessToken",
  "refreshToken",
  "idToken",
  "token",
  "clientSecret",
  "secret",
  "password",
  "authorization",
  "bearer",
  "credential",
  "assertion",
];

/**
 * Sanitize context by redacting sensitive fields.
 */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log level priority (lower = more important).
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private context: Record<string, unknown>;

  constructor(level: LogLevel = "info", context: Record<string, unknown> = {}) {
    this.level = level;
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...sanitizeContext(context ?? {}) };
    const contextStr = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : "";
    return `[${timestamp}] ${level.toUpperCase()} [azure-ad] ${message}${contextStr}`;
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  trace(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("trace")) {
      console.log(this.formatMessage("trace", message, context));
    }
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...context });
  }
}

/**
 * No-op logger for when logging is disabled.
 */
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

/**
 * No-op metrics collector for when metrics are disabled.
 */
export class NoopMetricsCollector implements MetricsCollector {
  incrementCounter(_name: string, _value?: number, _labels?: Record<string, string>): void {}
  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {}
  setGauge(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/**
 * No-op tracer for when tracing is disabled.
 */
export class NoopTracer implements Tracer {
  private noopSpan: SpanContext = {
    spanId: "",
    traceId: "",
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

/**
 * Create a console logger.
 */
export function createConsoleLogger(level: LogLevel = "info"): Logger {
  return new ConsoleLogger(level);
}

/**
 * Create a no-op logger.
 */
export function createNoopLogger(): Logger {
  return new NoopLogger();
}

/**
 * Create a no-op metrics collector.
 */
export function createNoopMetricsCollector(): MetricsCollector {
  return new NoopMetricsCollector();
}

/**
 * Create a no-op tracer.
 */
export function createNoopTracer(): Tracer {
  return new NoopTracer();
}
