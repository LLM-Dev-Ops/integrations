/**
 * Structured logging utilities for DynamoDB operations
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface Logger {
  error(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
  trace(message: string, context?: Record<string, any>): void;
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
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  trace(message: string, context?: Record<string, any>): void {
    this.log('trace', message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
      case 'trace':
        console.debug(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
}

/**
 * No-op logger for production environments where logging is disabled
 */
export class NoopLogger implements Logger {
  error(_message: string, _context?: Record<string, any>): void {
    // No-op
  }

  warn(_message: string, _context?: Record<string, any>): void {
    // No-op
  }

  info(_message: string, _context?: Record<string, any>): void {
    // No-op
  }

  debug(_message: string, _context?: Record<string, any>): void {
    // No-op
  }

  trace(_message: string, _context?: Record<string, any>): void {
    // No-op
  }
}

/**
 * Helper function to log DynamoDB operation
 */
export function logOperation(
  logger: Logger,
  operation: string,
  tableName: string,
  duration: number
): void {
  logger.info(`DynamoDB operation completed`, {
    operation,
    tableName,
    durationMs: duration,
  });
}

/**
 * Helper function to log errors
 */
export function logError(logger: Logger, operation: string, error: Error): void {
  logger.error(`DynamoDB operation failed`, {
    operation,
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  });
}

/**
 * Helper function to log throttling events
 */
export function logThrottle(logger: Logger, tableName: string, operation: string): void {
  logger.warn(`DynamoDB operation throttled`, {
    tableName,
    operation,
  });
}
