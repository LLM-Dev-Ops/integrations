/**
 * Logging for vLLM Integration
 * Structured logging with configurable levels
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Console-based logger
 */
export class ConsoleLogger implements Logger {
  private readonly minLevel: number;
  private readonly baseContext: Record<string, unknown>;

  constructor(level: LogLevel = 'info', context: Record<string, unknown> = {}) {
    this.minLevel = LOG_LEVELS[level];
    this.baseContext = context;
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
    return new ConsoleLogger(
      this.getLevelName(this.minLevel),
      { ...this.baseContext, ...context }
    );
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] > this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: { ...this.baseContext, ...context },
    };

    // Sanitize sensitive data
    this.sanitize(entry);

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'debug':
      case 'trace':
        console.debug(output);
        break;
    }
  }

  private sanitize(entry: LogEntry): void {
    if (!entry.context) return;

    const sensitiveKeys = ['authToken', 'token', 'password', 'apiKey', 'secret'];

    for (const key of sensitiveKeys) {
      if (key in entry.context) {
        entry.context[key] = '[REDACTED]';
      }
    }
  }

  private getLevelName(level: number): LogLevel {
    for (const [name, value] of Object.entries(LOG_LEVELS)) {
      if (value === level) {
        return name as LogLevel;
      }
    }
    return 'info';
  }
}

/**
 * No-op logger for when logging is disabled
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
 * In-memory logger for testing
 */
export class InMemoryLogger implements Logger {
  private readonly entries: LogEntry[] = [];
  private readonly baseContext: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.baseContext = context;
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
    return new InMemoryLogger({ ...this.baseContext, ...context });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  clear(): void {
    this.entries.length = 0;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.entries.push({
      level,
      message,
      timestamp: Date.now(),
      context: { ...this.baseContext, ...context },
    });
  }
}

/**
 * Create a logger based on environment
 */
export function createLogger(level: LogLevel = 'info'): Logger {
  return new ConsoleLogger(level);
}
