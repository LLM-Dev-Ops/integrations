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
export declare function createDefaultLoggingConfig(): LoggingConfig;
/**
 * Console-based logger with structured output
 */
export declare class ConsoleLogger implements Logger {
    private config;
    constructor(config?: Partial<LoggingConfig>);
    trace(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
    private log;
}
/**
 * No-op logger for production environments where logging is disabled
 */
export declare class NoopLogger implements Logger {
    trace(_message: string, _context?: Record<string, unknown>): void;
    debug(_message: string, _context?: Record<string, unknown>): void;
    info(_message: string, _context?: Record<string, unknown>): void;
    warn(_message: string, _context?: Record<string, unknown>): void;
    error(_message: string, _context?: Record<string, unknown>): void;
}
/**
 * Logs an outgoing HTTP request
 */
export declare function logRequest(logger: Logger, method: string, path: string, body?: unknown): void;
/**
 * Logs an incoming HTTP response
 */
export declare function logResponse(logger: Logger, status: number, durationMs: number, body?: unknown): void;
/**
 * Logs an error with context
 */
export declare function logError(logger: Logger, error: Error, context: string): void;
//# sourceMappingURL=logging.d.ts.map