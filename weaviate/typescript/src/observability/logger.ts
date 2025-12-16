/**
 * Logger implementations for the Weaviate client.
 *
 * Provides NoopLogger and ConsoleLogger with structured logging and auto-redaction.
 */

import { Logger, LogLevel, LogEntry } from './types';

// ============================================================================
// NoopLogger Implementation
// ============================================================================

/**
 * No-op logger implementation
 */
export class NoopLogger implements Logger {
  debug(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  info(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  setLevel(_level: LogLevel): void {
    // No-op
  }
}

// ============================================================================
// ConsoleLogger Implementation
// ============================================================================

/**
 * Console logger options
 */
export interface ConsoleLoggerOptions {
  /** Logger name/component */
  name?: string;
  /** Log level */
  level?: LogLevel;
  /** Use JSON output instead of formatted text */
  json?: boolean;
  /** Custom sensitive field names to redact */
  sensitiveFields?: string[];
}

/**
 * Console logger implementation with structured logging and auto-redaction
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.Info;
  private readonly name?: string;
  private readonly json: boolean;
  private readonly sensitiveFields: Set<string>;

  constructor(options?: ConsoleLoggerOptions) {
    this.name = options?.name ?? 'weaviate';
    this.json = options?.json ?? false;

    if (options?.level !== undefined) {
      this.level = options.level;
    }

    // Default sensitive fields
    const defaultSensitive = [
      'apiKey',
      'api_key',
      'token',
      'password',
      'secret',
      'authorization',
      'auth',
      'bearer',
      'vector',
      'vectors',
      'embedding',
      'embeddings',
    ];

    this.sensitiveFields = new Set([
      ...defaultSensitive,
      ...(options?.sensitiveFields ?? []),
    ]);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
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

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level]?.toUpperCase() ?? 'UNKNOWN';

    // Redact sensitive values
    const safeContext = context ? this.redactSensitive(context) : undefined;

    if (this.json) {
      // JSON output
      const logEntry: LogEntry & { component?: string } = {
        level,
        message,
        timestamp: Date.now(),
        context: safeContext,
      };

      if (this.name) {
        logEntry.component = this.name;
      }

      const logFn = this.getLogFunction(level);
      logFn(JSON.stringify(logEntry));
    } else {
      // Formatted text output
      const prefix = this.name ? `[${this.name}]` : '';
      const logFn = this.getLogFunction(level);

      if (safeContext && Object.keys(safeContext).length > 0) {
        logFn(`${timestamp} ${levelStr}${prefix} ${message}`, safeContext);
      } else {
        logFn(`${timestamp} ${levelStr}${prefix} ${message}`);
      }
    }
  }

  private getLogFunction(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case LogLevel.Error:
        return console.error;
      case LogLevel.Warn:
        return console.warn;
      case LogLevel.Debug:
        return console.debug;
      default:
        return console.log;
    }
  }

  private redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        // Check if it's a vector array (array of numbers)
        if (value.length > 0 && typeof value[0] === 'number') {
          result[key] = `[vector:${value.length}]`;
        } else {
          result[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? this.redactSensitive(item as Record<string, unknown>)
              : item
          );
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    for (const sensitive of this.sensitiveFields) {
      if (lowerKey.includes(sensitive.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a logger based on configuration
 */
export function createLogger(options?: {
  enabled?: boolean;
  type?: 'console' | 'noop';
  level?: LogLevel;
  json?: boolean;
  name?: string;
}): Logger {
  if (options?.enabled === false || options?.type === 'noop') {
    return new NoopLogger();
  }

  if (options?.type === 'console') {
    return new ConsoleLogger({
      name: options.name ?? 'weaviate',
      level: options.level ?? LogLevel.Info,
      json: options.json ?? false,
    });
  }

  // Default to console logger
  return new ConsoleLogger({
    name: options?.name ?? 'weaviate',
    level: options?.level ?? LogLevel.Info,
  });
}

/**
 * Create a structured log context for Weaviate operations
 */
export function createLogContext(params: {
  operation?: string;
  class?: string;
  tenant?: string;
  duration_ms?: number;
  results?: number;
  error?: Error;
  [key: string]: unknown;
}): Record<string, unknown> {
  const context: Record<string, unknown> = {
    component: 'weaviate',
  };

  if (params.operation) context.operation = params.operation;
  if (params.class) context.class = params.class;
  if (params.tenant) context.tenant = params.tenant;
  if (params.duration_ms !== undefined) context.duration_ms = params.duration_ms;
  if (params.results !== undefined) context.results = params.results;

  if (params.error) {
    context.error = {
      name: params.error.name,
      message: params.error.message,
      stack: params.error.stack,
    };
  }

  // Add any additional fields
  for (const [key, value] of Object.entries(params)) {
    if (
      !['operation', 'class', 'tenant', 'duration_ms', 'results', 'error'].includes(key)
    ) {
      context[key] = value;
    }
  }

  return context;
}
