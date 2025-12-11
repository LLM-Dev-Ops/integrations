/**
 * Logging configuration and utilities for the Mistral client.
 */

/**
 * Log level enumeration.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off';

/**
 * Numeric log level values for comparison.
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  off: 5,
};

/**
 * Logging configuration.
 */
export interface LogConfig {
  /** Minimum log level. */
  level: LogLevel;
  /** Whether to include timestamps. */
  includeTimestamps: boolean;
  /** Whether to include request IDs. */
  includeRequestIds: boolean;
  /** Whether to log request bodies. */
  logRequestBodies: boolean;
  /** Whether to log response bodies. */
  logResponseBodies: boolean;
  /** Maximum body length to log. */
  maxBodyLength: number;
  /** Whether to redact sensitive data. */
  redactSensitive: boolean;
}

/**
 * Default log configuration.
 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  level: 'info',
  includeTimestamps: true,
  includeRequestIds: true,
  logRequestBodies: false,
  logResponseBodies: false,
  maxBodyLength: 1024,
  redactSensitive: true,
};

/**
 * Logger interface.
 */
export interface Logger {
  /** Logs a message at the specified level. */
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;

  /** Logs a trace message. */
  trace(message: string, context?: Record<string, unknown>): void;

  /** Logs a debug message. */
  debug(message: string, context?: Record<string, unknown>): void;

  /** Logs an info message. */
  info(message: string, context?: Record<string, unknown>): void;

  /** Logs a warning message. */
  warn(message: string, context?: Record<string, unknown>): void;

  /** Logs an error message. */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default console logger.
 */
export class ConsoleLogger implements Logger {
  private readonly config: LogConfig;

  constructor(config: Partial<LogConfig> = {}) {
    this.config = { ...DEFAULT_LOG_CONFIG, ...config };
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const parts: string[] = [];

    if (this.config.includeTimestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(this.redactIfNeeded(message));

    if (context) {
      parts.push(JSON.stringify(this.redactContext(context)));
    }

    const output = parts.join(' ');

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
      case 'trace':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  private redactIfNeeded(text: string): string {
    if (!this.config.redactSensitive) return text;

    return text.replace(
      /(api_key|apiKey|authorization|password|secret|token|bearer)[=:]["']?[^"'\s,}]*/gi,
      '$1=[REDACTED]'
    );
  }

  private redactContext(context: Record<string, unknown>): Record<string, unknown> {
    if (!this.config.redactSensitive) return context;

    const sensitiveKeys = ['api_key', 'apiKey', 'authorization', 'password', 'secret', 'token'];
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactContext(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}

/**
 * No-op logger for when logging is disabled.
 */
export class NoopLogger implements Logger {
  log(): void {}
  trace(): void {}
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Creates a console logger with the given configuration.
 */
export function createLogger(config?: Partial<LogConfig>): Logger {
  return new ConsoleLogger(config);
}
