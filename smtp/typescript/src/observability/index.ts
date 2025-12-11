/**
 * Observability and tracing for the SMTP client.
 */

/**
 * Log levels.
 */
export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/**
 * Log entry structure.
 */
export interface LogEntry {
  /** Log level. */
  level: LogLevel;
  /** Log message. */
  message: string;
  /** Timestamp. */
  timestamp: Date;
  /** Request context. */
  context?: RequestContext;
  /** Additional fields. */
  fields?: Record<string, unknown>;
  /** Error if applicable. */
  error?: Error;
}

/**
 * Request context for tracing.
 */
export interface RequestContext {
  /** Unique request ID. */
  requestId: string;
  /** Operation name. */
  operation: string;
  /** Start time. */
  startTime: Date;
  /** Additional tags. */
  tags: Record<string, string>;
}

/**
 * Creates a new request context.
 */
export function createRequestContext(operation: string, tags?: Record<string, string>): RequestContext {
  return {
    requestId: generateRequestId(),
    operation,
    startTime: new Date(),
    tags: tags ?? {},
  };
}

/**
 * Generates a unique request ID.
 */
function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Logger interface.
 */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, error?: Error, fields?: Record<string, unknown>): void;
  withContext(context: RequestContext): Logger;
}

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private readonly minLevel: LogLevel;
  private readonly context?: RequestContext;

  constructor(minLevel: LogLevel = LogLevel.Info, context?: RequestContext) {
    this.minLevel = minLevel;
    this.context = context;
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, fields);
  }

  error(message: string, error?: Error, fields?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, { ...fields, error: error?.message, stack: error?.stack });
  }

  withContext(context: RequestContext): Logger {
    return new ConsoleLogger(this.minLevel, context);
  }

  private log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.context,
      fields,
    };

    const output = this.formatEntry(entry);

    switch (level) {
      case LogLevel.Debug:
        console.debug(output);
        break;
      case LogLevel.Info:
        console.info(output);
        break;
      case LogLevel.Warn:
        console.warn(output);
        break;
      case LogLevel.Error:
        console.error(output);
        break;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = [LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatEntry(entry: LogEntry): string {
    const parts: string[] = [
      entry.timestamp.toISOString(),
      `[${entry.level.toUpperCase()}]`,
    ];

    if (entry.context) {
      parts.push(`[${entry.context.requestId}]`);
      parts.push(`[${entry.context.operation}]`);
    }

    parts.push(entry.message);

    if (entry.fields && Object.keys(entry.fields).length > 0) {
      parts.push(JSON.stringify(entry.fields));
    }

    return parts.join(' ');
  }
}

/**
 * No-op logger that discards all logs.
 */
export class NoopLogger implements Logger {
  debug(): void {
    // No-op
  }
  info(): void {
    // No-op
  }
  warn(): void {
    // No-op
  }
  error(): void {
    // No-op
  }
  withContext(): Logger {
    return this;
  }
}

/**
 * SMTP operation metrics.
 */
export interface SmtpMetrics {
  /** Total emails sent. */
  emailsSent: number;
  /** Failed email attempts. */
  emailsFailed: number;
  /** Total bytes sent. */
  bytesSent: number;
  /** Connection attempts. */
  connectionAttempts: number;
  /** Successful connections. */
  connectionSuccesses: number;
  /** Failed connections. */
  connectionFailures: number;
  /** Authentication attempts. */
  authAttempts: number;
  /** Successful authentications. */
  authSuccesses: number;
  /** Failed authentications. */
  authFailures: number;
  /** TLS upgrade attempts. */
  tlsUpgrades: number;
  /** Retry attempts. */
  retryAttempts: number;
  /** Circuit breaker trips. */
  circuitBreakerTrips: number;
  /** Rate limit hits. */
  rateLimitHits: number;
  /** Send latency histogram (ms). */
  sendLatencyMs: number[];
  /** Connection latency histogram (ms). */
  connectionLatencyMs: number[];
}

/**
 * Creates empty metrics.
 */
export function createEmptyMetrics(): SmtpMetrics {
  return {
    emailsSent: 0,
    emailsFailed: 0,
    bytesSent: 0,
    connectionAttempts: 0,
    connectionSuccesses: 0,
    connectionFailures: 0,
    authAttempts: 0,
    authSuccesses: 0,
    authFailures: 0,
    tlsUpgrades: 0,
    retryAttempts: 0,
    circuitBreakerTrips: 0,
    rateLimitHits: 0,
    sendLatencyMs: [],
    connectionLatencyMs: [],
  };
}

/**
 * Metrics collector.
 */
export class MetricsCollector {
  private metrics: SmtpMetrics = createEmptyMetrics();

  /** Records a successful email send. */
  recordEmailSent(bytesSent: number, latencyMs: number): void {
    this.metrics.emailsSent++;
    this.metrics.bytesSent += bytesSent;
    this.metrics.sendLatencyMs.push(latencyMs);
  }

  /** Records a failed email send. */
  recordEmailFailed(): void {
    this.metrics.emailsFailed++;
  }

  /** Records a connection attempt. */
  recordConnectionAttempt(): void {
    this.metrics.connectionAttempts++;
  }

  /** Records a successful connection. */
  recordConnectionSuccess(latencyMs: number): void {
    this.metrics.connectionSuccesses++;
    this.metrics.connectionLatencyMs.push(latencyMs);
  }

  /** Records a failed connection. */
  recordConnectionFailure(): void {
    this.metrics.connectionFailures++;
  }

  /** Records an authentication attempt. */
  recordAuthAttempt(): void {
    this.metrics.authAttempts++;
  }

  /** Records a successful authentication. */
  recordAuthSuccess(): void {
    this.metrics.authSuccesses++;
  }

  /** Records a failed authentication. */
  recordAuthFailure(): void {
    this.metrics.authFailures++;
  }

  /** Records a TLS upgrade. */
  recordTlsUpgrade(): void {
    this.metrics.tlsUpgrades++;
  }

  /** Records a retry attempt. */
  recordRetryAttempt(): void {
    this.metrics.retryAttempts++;
  }

  /** Records a circuit breaker trip. */
  recordCircuitBreakerTrip(): void {
    this.metrics.circuitBreakerTrips++;
  }

  /** Records a rate limit hit. */
  recordRateLimitHit(): void {
    this.metrics.rateLimitHits++;
  }

  /** Gets current metrics. */
  getMetrics(): SmtpMetrics {
    return { ...this.metrics };
  }

  /** Gets computed statistics. */
  getStats(): {
    successRate: number;
    avgSendLatencyMs: number;
    avgConnectionLatencyMs: number;
    p95SendLatencyMs: number;
    p99SendLatencyMs: number;
  } {
    const totalEmails = this.metrics.emailsSent + this.metrics.emailsFailed;
    const successRate = totalEmails > 0 ? this.metrics.emailsSent / totalEmails : 1;

    return {
      successRate,
      avgSendLatencyMs: this.average(this.metrics.sendLatencyMs),
      avgConnectionLatencyMs: this.average(this.metrics.connectionLatencyMs),
      p95SendLatencyMs: this.percentile(this.metrics.sendLatencyMs, 95),
      p99SendLatencyMs: this.percentile(this.metrics.sendLatencyMs, 99),
    };
  }

  /** Resets all metrics. */
  reset(): void {
    this.metrics = createEmptyMetrics();
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }
}

/**
 * Timer for measuring durations.
 */
export class Timer {
  private readonly startTime: number;

  private constructor() {
    this.startTime = Date.now();
  }

  /** Starts a new timer. */
  static start(): Timer {
    return new Timer();
  }

  /** Gets elapsed time in milliseconds. */
  elapsed(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Tracing hook for SMTP operations.
 */
export interface TracingHook {
  /** Called before an operation starts. */
  onOperationStart?(context: RequestContext): void;
  /** Called after an operation completes successfully. */
  onOperationSuccess?(context: RequestContext, durationMs: number): void;
  /** Called after an operation fails. */
  onOperationError?(context: RequestContext, error: Error, durationMs: number): void;
  /** Called when a connection is established. */
  onConnect?(host: string, port: number, durationMs: number): void;
  /** Called when TLS is upgraded. */
  onTlsUpgrade?(host: string, tlsVersion: string): void;
  /** Called when authentication completes. */
  onAuthenticate?(method: string, success: boolean): void;
  /** Called when an email is sent. */
  onEmailSent?(messageId: string, recipients: number, durationMs: number): void;
}

/**
 * Composite tracing hook that delegates to multiple hooks.
 */
export class CompositeTracingHook implements TracingHook {
  private readonly hooks: TracingHook[] = [];

  /** Adds a hook. */
  addHook(hook: TracingHook): void {
    this.hooks.push(hook);
  }

  /** Removes a hook. */
  removeHook(hook: TracingHook): void {
    const index = this.hooks.indexOf(hook);
    if (index !== -1) {
      this.hooks.splice(index, 1);
    }
  }

  onOperationStart(context: RequestContext): void {
    for (const hook of this.hooks) {
      hook.onOperationStart?.(context);
    }
  }

  onOperationSuccess(context: RequestContext, durationMs: number): void {
    for (const hook of this.hooks) {
      hook.onOperationSuccess?.(context, durationMs);
    }
  }

  onOperationError(context: RequestContext, error: Error, durationMs: number): void {
    for (const hook of this.hooks) {
      hook.onOperationError?.(context, error, durationMs);
    }
  }

  onConnect(host: string, port: number, durationMs: number): void {
    for (const hook of this.hooks) {
      hook.onConnect?.(host, port, durationMs);
    }
  }

  onTlsUpgrade(host: string, tlsVersion: string): void {
    for (const hook of this.hooks) {
      hook.onTlsUpgrade?.(host, tlsVersion);
    }
  }

  onAuthenticate(method: string, success: boolean): void {
    for (const hook of this.hooks) {
      hook.onAuthenticate?.(method, success);
    }
  }

  onEmailSent(messageId: string, recipients: number, durationMs: number): void {
    for (const hook of this.hooks) {
      hook.onEmailSent?.(messageId, recipients, durationMs);
    }
  }
}

/**
 * Creates a console logger.
 */
export function createLogger(minLevel?: LogLevel): Logger {
  return new ConsoleLogger(minLevel);
}

/**
 * Creates a no-op logger.
 */
export function createNoopLogger(): Logger {
  return new NoopLogger();
}

/**
 * Creates a metrics collector.
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
