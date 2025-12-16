/**
 * Correlated logger implementation
 * Automatically injects trace context into all log calls
 */

import type { Logger } from '../types/index.js';
import type { LogContext } from './context.js';
import { injectTraceContext } from './correlation.js';

/**
 * Function to get current log context
 */
export type LogContextProvider = () => LogContext | null;

/**
 * Correlated logger that wraps a base logger and injects trace context
 */
export class CorrelatedLogger implements Logger {
  constructor(
    private baseLogger: Logger,
    private contextProvider: LogContextProvider
  ) {}

  /**
   * Log at trace level
   */
  trace(message: string, context?: Record<string, any>): void {
    this.log('trace', message, context);
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }

  /**
   * Internal log method that injects trace context
   */
  private log(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>
  ): void {
    const logContext = this.contextProvider();
    const enrichedContext = injectTraceContext(context ?? {}, logContext);

    this.baseLogger[level](message, enrichedContext);
  }

  /**
   * Create a child logger with additional context
   * @param additionalContext - Additional context to always include
   * @returns Child logger
   */
  child(additionalContext: Record<string, any>): CorrelatedLogger {
    const childLogger: Logger = {
      trace: (message: string, context?: Record<string, any>) => {
        this.trace(message, { ...additionalContext, ...context });
      },
      debug: (message: string, context?: Record<string, any>) => {
        this.debug(message, { ...additionalContext, ...context });
      },
      info: (message: string, context?: Record<string, any>) => {
        this.info(message, { ...additionalContext, ...context });
      },
      warn: (message: string, context?: Record<string, any>) => {
        this.warn(message, { ...additionalContext, ...context });
      },
      error: (message: string, context?: Record<string, any>) => {
        this.error(message, { ...additionalContext, ...context });
      },
    };

    return new CorrelatedLogger(childLogger, this.contextProvider);
  }
}