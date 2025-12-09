/**
 * Structured logging utilities
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'pretty' | 'json' | 'compact';

export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
  includeTimestamps: boolean;
  includeTarget: boolean;
  includeFileLine: boolean;
}

export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Creates a default logging configuration
 */
export function createDefaultLoggingConfig(): LoggingConfig {
  return {
    level: 'info',
    format: 'pretty',
    includeTimestamps: true,
    includeTarget: true,
    includeFileLine: false,
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

/**
 * Console-based logger with structured output
 */
export class ConsoleLogger implements Logger {
  private config: LoggingConfig;

  constructor(config?: Partial<LoggingConfig>) {
    this.config = { ...createDefaultLoggingConfig(), ...config };
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

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const timestamp = this.config.includeTimestamps ? new Date().toISOString() : undefined;

    if (this.config.format === 'json') {
      console.log(JSON.stringify({ timestamp, level, message, ...context }));
    } else if (this.config.format === 'compact') {
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`[${level.toUpperCase()}] ${message}${contextStr}`);
    } else {
      const parts: string[] = [];
      if (timestamp) parts.push(`[${timestamp}]`);
      parts.push(`[${level.toUpperCase()}]`);
      parts.push(message);
      if (context) {
        parts.push('\n  ' + Object.entries(context)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n  '));
      }
      console.log(parts.join(' '));
    }
  }
}

/**
 * No-op logger for production environments where logging is disabled
 */
export class NoopLogger implements Logger {
  trace(_message: string, _context?: Record<string, unknown>): void {}
  debug(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  error(_message: string, _context?: Record<string, unknown>): void {}
}

/**
 * Logs an outgoing HTTP request
 */
export function logRequest(
  logger: Logger,
  method: string,
  path: string,
  body?: unknown
): void {
  logger.debug('Outgoing request', { method, path, body });
}

/**
 * Logs an incoming HTTP response
 */
export function logResponse(
  logger: Logger,
  status: number,
  durationMs: number,
  body?: unknown
): void {
  logger.debug('Incoming response', { status, durationMs, body });
}

/**
 * Logs an error with context
 */
export function logError(
  logger: Logger,
  error: Error,
  context: string
): void {
  logger.error('Error occurred', {
    context,
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  });
}
