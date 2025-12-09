/**
 * Structured logging utilities
 */
/**
 * Creates a default logging configuration
 */
export function createDefaultLoggingConfig() {
    return {
        level: 'info',
        format: 'pretty',
        includeTimestamps: true,
        includeTarget: true,
        includeFileLine: false,
    };
}
const LOG_LEVEL_PRIORITY = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
};
/**
 * Console-based logger with structured output
 */
export class ConsoleLogger {
    config;
    constructor(config) {
        this.config = { ...createDefaultLoggingConfig(), ...config };
    }
    trace(message, context) {
        this.log('trace', message, context);
    }
    debug(message, context) {
        this.log('debug', message, context);
    }
    info(message, context) {
        this.log('info', message, context);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    error(message, context) {
        this.log('error', message, context);
    }
    log(level, message, context) {
        if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
            return;
        }
        const timestamp = this.config.includeTimestamps ? new Date().toISOString() : undefined;
        if (this.config.format === 'json') {
            console.log(JSON.stringify({ timestamp, level, message, ...context }));
        }
        else if (this.config.format === 'compact') {
            const contextStr = context ? ` ${JSON.stringify(context)}` : '';
            console.log(`[${level.toUpperCase()}] ${message}${contextStr}`);
        }
        else {
            const parts = [];
            if (timestamp)
                parts.push(`[${timestamp}]`);
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
export class NoopLogger {
    trace(_message, _context) { }
    debug(_message, _context) { }
    info(_message, _context) { }
    warn(_message, _context) { }
    error(_message, _context) { }
}
/**
 * Logs an outgoing HTTP request
 */
export function logRequest(logger, method, path, body) {
    logger.debug('Outgoing request', { method, path, body });
}
/**
 * Logs an incoming HTTP response
 */
export function logResponse(logger, status, durationMs, body) {
    logger.debug('Incoming response', { status, durationMs, body });
}
/**
 * Logs an error with context
 */
export function logError(logger, error, context) {
    logger.error('Error occurred', {
        context,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
    });
}
//# sourceMappingURL=logging.js.map