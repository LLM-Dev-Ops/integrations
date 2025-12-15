/**
 * Azure Key Vault Observability - Logging
 *
 * Logging utilities for Key Vault operations following SPARC specification.
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * No-op logger
 */
export class NoOpLogger implements Logger {
  debug(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  info(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _error?: Error, _context?: Record<string, unknown>): void {
    // No-op
  }
}

/**
 * Console logger
 */
export class ConsoleLogger implements Logger {
  constructor(private minLevel: LogLevel = LogLevel.INFO) {}

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.format(LogLevel.DEBUG, message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.format(LogLevel.INFO, message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.format(LogLevel.WARN, message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.format(LogLevel.ERROR, message, context);
      if (error) {
        console.error(entry, error);
      } else {
        console.error(entry);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private format(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }
}

/**
 * In-memory logger for testing
 */
export class InMemoryLogger implements Logger {
  private entries: LogEntry[] = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    this.entries.push({
      level,
      message,
      timestamp: new Date(),
      context,
      error,
    });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }
}

/**
 * Check if a secret is near expiry and log warning
 *
 * @param expiresOn - Expiration date
 * @param logger - Logger instance
 * @param secretName - Secret name
 * @param warningThresholdMs - Time before expiry to warn (default: 7 days)
 */
export function checkExpiryWarning(
  expiresOn: Date | undefined,
  logger: Logger,
  secretName: string,
  warningThresholdMs = 7 * 24 * 60 * 60 * 1000 // 7 days
): void {
  if (!expiresOn) {
    return;
  }

  const now = Date.now();
  const expiryTime = expiresOn.getTime();
  const timeUntilExpiry = expiryTime - now;

  // Already expired
  if (timeUntilExpiry < 0) {
    logger.warn(`Secret '${secretName}' has already expired`, {
      secret_name: secretName,
      expired_at: expiresOn.toISOString(),
      expired_days_ago: Math.floor(Math.abs(timeUntilExpiry) / (24 * 60 * 60 * 1000)),
    });
    return;
  }

  // Near expiry
  if (timeUntilExpiry < warningThresholdMs) {
    const daysUntilExpiry = Math.floor(timeUntilExpiry / (24 * 60 * 60 * 1000));
    logger.warn(`Secret '${secretName}' will expire soon`, {
      secret_name: secretName,
      expires_at: expiresOn.toISOString(),
      days_until_expiry: daysUntilExpiry,
    });
  }
}
