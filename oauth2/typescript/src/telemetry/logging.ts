/**
 * OAuth2 Logging
 *
 * Structured logging for OAuth2 operations.
 */

/**
 * Log level.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Log context fields.
 */
export interface OAuth2LogContext {
  /** Correlation ID */
  correlationId?: string;
  /** OAuth2 flow type */
  flow?: string;
  /** Provider identifier */
  provider?: string;
  /** Client ID (not secret) */
  clientId?: string;
  /** Requested scopes */
  scopes?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error code */
  errorCode?: string;
  /** Error type */
  errorType?: string;
  /** Additional fields */
  [key: string]: unknown;
}

/**
 * Logger interface.
 */
export interface Logger {
  /**
   * Log at trace level.
   */
  trace(message: string, context?: OAuth2LogContext): void;

  /**
   * Log at debug level.
   */
  debug(message: string, context?: OAuth2LogContext): void;

  /**
   * Log at info level.
   */
  info(message: string, context?: OAuth2LogContext): void;

  /**
   * Log at warn level.
   */
  warn(message: string, context?: OAuth2LogContext): void;

  /**
   * Log at error level.
   */
  error(message: string, context?: OAuth2LogContext): void;

  /**
   * Create child logger with additional context.
   */
  child(context: OAuth2LogContext): Logger;
}

/**
 * No-op logger implementation.
 */
export const noOpLogger: Logger = {
  trace(): void {},
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
  child(): Logger {
    return noOpLogger;
  },
};

/**
 * Log entry for in-memory logger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: OAuth2LogContext;
  timestamp: Date;
}

/**
 * In-memory logger for testing.
 */
export class InMemoryLogger implements Logger {
  private logs: LogEntry[] = [];
  private baseContext: OAuth2LogContext;

  constructor(baseContext: OAuth2LogContext = {}) {
    this.baseContext = baseContext;
  }

  private log(level: LogLevel, message: string, context?: OAuth2LogContext): void {
    this.logs.push({
      level,
      message,
      context: { ...this.baseContext, ...context },
      timestamp: new Date(),
    });
  }

  trace(message: string, context?: OAuth2LogContext): void {
    this.log("trace", message, context);
  }

  debug(message: string, context?: OAuth2LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: OAuth2LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: OAuth2LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: OAuth2LogContext): void {
    this.log("error", message, context);
  }

  child(context: OAuth2LogContext): Logger {
    return new InMemoryLogger({ ...this.baseContext, ...context });
  }

  /**
   * Get all log entries.
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level.
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((l) => l.level === level);
  }

  /**
   * Get logs containing message.
   */
  getLogsContaining(substring: string): LogEntry[] {
    return this.logs.filter((l) => l.message.includes(substring));
  }

  /**
   * Assert log was recorded.
   */
  assertLogged(level: LogLevel, messageContains: string): void {
    const found = this.logs.find(
      (l) => l.level === level && l.message.includes(messageContains)
    );
    if (!found) {
      throw new Error(
        `Expected log at level ${level} containing "${messageContains}"`
      );
    }
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.logs = [];
  }
}

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private baseContext: OAuth2LogContext;
  private minLevel: LogLevel;
  private levelOrder: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
  };

  constructor(options?: { minLevel?: LogLevel; context?: OAuth2LogContext }) {
    this.minLevel = options?.minLevel ?? "info";
    this.baseContext = options?.context ?? {};
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.minLevel];
  }

  private formatContext(context?: OAuth2LogContext): string {
    const merged = { ...this.baseContext, ...context };
    const entries = Object.entries(merged).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "";
    return " " + JSON.stringify(Object.fromEntries(entries));
  }

  trace(message: string, context?: OAuth2LogContext): void {
    if (this.shouldLog("trace")) {
      console.trace(`[TRACE] ${message}${this.formatContext(context)}`);
    }
  }

  debug(message: string, context?: OAuth2LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}${this.formatContext(context)}`);
    }
  }

  info(message: string, context?: OAuth2LogContext): void {
    if (this.shouldLog("info")) {
      console.info(`[INFO] ${message}${this.formatContext(context)}`);
    }
  }

  warn(message: string, context?: OAuth2LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}${this.formatContext(context)}`);
    }
  }

  error(message: string, context?: OAuth2LogContext): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}${this.formatContext(context)}`);
    }
  }

  child(context: OAuth2LogContext): Logger {
    return new ConsoleLogger({
      minLevel: this.minLevel,
      context: { ...this.baseContext, ...context },
    });
  }
}

/**
 * Create in-memory logger for testing.
 */
export function createInMemoryLogger(
  context?: OAuth2LogContext
): InMemoryLogger {
  return new InMemoryLogger(context);
}

/**
 * Create console logger.
 */
export function createConsoleLogger(options?: {
  minLevel?: LogLevel;
  context?: OAuth2LogContext;
}): ConsoleLogger {
  return new ConsoleLogger(options);
}
