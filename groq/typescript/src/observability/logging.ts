/**
 * Logging infrastructure for the Groq client.
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
 * Log level priority for filtering.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
};

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
  /** Additional context. */
  context?: Record<string, unknown>;
  /** Error if applicable. */
  error?: Error;
}

/**
 * Logger interface.
 */
export interface Logger {
  /** Logs a debug message. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Logs an info message. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Logs a warning message. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Logs an error message. */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  /** Creates a child logger with additional context. */
  child(context: Record<string, unknown>): Logger;
}

/**
 * Log configuration.
 */
export interface LogConfig {
  /** Minimum log level. */
  level: LogLevel;
  /** Whether to include timestamps. */
  timestamps: boolean;
  /** Whether to output JSON. */
  json: boolean;
  /** Additional context for all logs. */
  context?: Record<string, unknown>;
}

/**
 * Default log configuration.
 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  level: LogLevel.Info,
  timestamps: true,
  json: false,
};

/**
 * Console logger implementation.
 */
export class ConsoleLogger implements Logger {
  private readonly config: LogConfig;
  private readonly baseContext: Record<string, unknown>;

  constructor(config: Partial<LogConfig> = {}, baseContext: Record<string, unknown> = {}) {
    this.config = { ...DEFAULT_LOG_CONFIG, ...config };
    this.baseContext = { ...this.config.context, ...baseContext };
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

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, context, error);
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.config, { ...this.baseContext, ...context });
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: { ...this.baseContext, ...context },
      error,
    };

    if (this.config.json) {
      this.outputJson(entry);
    } else {
      this.outputText(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  private outputJson(entry: LogEntry): void {
    const output = {
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp.toISOString(),
      ...entry.context,
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        },
      }),
    };

    console.log(JSON.stringify(output));
  }

  private outputText(entry: LogEntry): void {
    const parts: string[] = [];

    if (this.config.timestamps) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);
    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }

    const logFn = this.getLogFunction(entry.level);
    logFn(parts.join(' '));

    if (entry.error) {
      console.error(entry.error);
    }
  }

  private getLogFunction(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case LogLevel.Debug:
        return console.debug;
      case LogLevel.Info:
        return console.info;
      case LogLevel.Warn:
        return console.warn;
      case LogLevel.Error:
        return console.error;
    }
  }
}

/**
 * No-op logger that discards all messages.
 */
export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this;
  }
}

/**
 * Creates a console logger.
 */
export function createLogger(config: Partial<LogConfig> = {}): Logger {
  return new ConsoleLogger(config);
}

/**
 * Creates a no-op logger.
 */
export function createNoopLogger(): Logger {
  return new NoopLogger();
}
