/**
 * AWS CloudWatch Logs LogEventBuilder
 *
 * Fluent builder for structured log events with correlation support.
 */

import type {
  LogLevel,
  StructuredLogEvent,
} from '../types/index.js';

/**
 * Fluent builder for structured log events.
 *
 * @example
 * ```typescript
 * const event = new LogEventBuilder()
 *   .message('User login successful')
 *   .info()
 *   .traceId('abc-123')
 *   .requestId('req-456')
 *   .field('user_id', 'user-789')
 *   .field('ip_address', '192.168.1.1')
 *   .build();
 * ```
 */
export class LogEventBuilder {
  private _message?: string;
  private _timestamp?: number;
  private _level: LogLevel = 'info';
  private _traceId?: string;
  private _requestId?: string;
  private _spanId?: string;
  private _service?: string;
  private _fields: Record<string, unknown> = {};

  /**
   * Set the log message.
   *
   * @param msg - The log message
   * @returns This builder instance for chaining
   */
  message(msg: string): this {
    if (msg === undefined || msg === null) {
      throw new Error('Message cannot be null or undefined');
    }
    this._message = msg;
    return this;
  }

  /**
   * Set the log timestamp (epoch milliseconds).
   *
   * @param ts - Timestamp in epoch milliseconds
   * @returns This builder instance for chaining
   */
  timestamp(ts: number): this {
    if (ts < 0) {
      throw new Error('Timestamp must be non-negative');
    }
    this._timestamp = ts;
    return this;
  }

  /**
   * Set the log level.
   *
   * @param level - Log level (trace, debug, info, warn, error, fatal)
   * @returns This builder instance for chaining
   */
  level(level: LogLevel): this {
    const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid log level: ${level}. Must be one of: ${validLevels.join(', ')}`);
    }
    this._level = level;
    return this;
  }

  /**
   * Set log level to INFO.
   *
   * @returns This builder instance for chaining
   */
  info(): this {
    this._level = 'info';
    return this;
  }

  /**
   * Set log level to WARN.
   *
   * @returns This builder instance for chaining
   */
  warn(): this {
    this._level = 'warn';
    return this;
  }

  /**
   * Set log level to ERROR.
   *
   * @returns This builder instance for chaining
   */
  error(): this {
    this._level = 'error';
    return this;
  }

  /**
   * Set log level to DEBUG.
   *
   * @returns This builder instance for chaining
   */
  debug(): this {
    this._level = 'debug';
    return this;
  }

  /**
   * Set log level to TRACE.
   *
   * @returns This builder instance for chaining
   */
  trace(): this {
    this._level = 'trace';
    return this;
  }

  /**
   * Set log level to FATAL.
   *
   * @returns This builder instance for chaining
   */
  fatal(): this {
    this._level = 'fatal';
    return this;
  }

  /**
   * Set the trace ID for distributed tracing correlation.
   *
   * @param id - Trace ID (e.g., from OpenTelemetry)
   * @returns This builder instance for chaining
   */
  traceId(id: string): this {
    if (!id || id.trim().length === 0) {
      throw new Error('Trace ID cannot be empty');
    }
    this._traceId = id;
    return this;
  }

  /**
   * Set the request ID for request-level correlation.
   *
   * @param id - Request ID
   * @returns This builder instance for chaining
   */
  requestId(id: string): this {
    if (!id || id.trim().length === 0) {
      throw new Error('Request ID cannot be empty');
    }
    this._requestId = id;
    return this;
  }

  /**
   * Set the span ID for trace span correlation.
   *
   * @param id - Span ID (e.g., from OpenTelemetry)
   * @returns This builder instance for chaining
   */
  spanId(id: string): this {
    if (!id || id.trim().length === 0) {
      throw new Error('Span ID cannot be empty');
    }
    this._spanId = id;
    return this;
  }

  /**
   * Set the service name that emitted the log.
   *
   * @param name - Service name
   * @returns This builder instance for chaining
   */
  service(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Service name cannot be empty');
    }
    this._service = name;
    return this;
  }

  /**
   * Add a custom field to the log event.
   *
   * @param key - Field name
   * @param value - Field value
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.field('user_id', 'user-123')
   * builder.field('duration_ms', 45)
   * builder.field('metadata', { ip: '192.168.1.1' })
   * ```
   */
  field(key: string, value: unknown): this {
    if (!key || key.trim().length === 0) {
      throw new Error('Field key cannot be empty');
    }
    this._fields[key] = value;
    return this;
  }

  /**
   * Add multiple custom fields to the log event.
   *
   * @param fields - Object containing field key-value pairs
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.fields({
   *   user_id: 'user-123',
   *   duration_ms: 45,
   *   ip_address: '192.168.1.1'
   * })
   * ```
   */
  fields(fields: Record<string, unknown>): this {
    if (!fields) {
      throw new Error('Fields object cannot be null or undefined');
    }
    for (const [key, value] of Object.entries(fields)) {
      if (!key || key.trim().length === 0) {
        throw new Error('Field key cannot be empty');
      }
      this._fields[key] = value;
    }
    return this;
  }

  /**
   * Build the structured log event.
   *
   * @returns The constructed StructuredLogEvent
   * @throws Error if required fields are missing
   */
  build(): StructuredLogEvent {
    // Validate required fields
    if (this._message === undefined) {
      throw new Error('Message is required');
    }

    // Build the event
    const event: StructuredLogEvent = {
      level: this._level,
      message: this._message,
    };

    // Add timestamp (default to now if not provided)
    if (this._timestamp !== undefined) {
      event.timestamp = this._timestamp;
    } else {
      event.timestamp = Date.now();
    }

    // Add correlation IDs if provided
    if (this._traceId) {
      event.traceId = this._traceId;
    }
    if (this._requestId) {
      event.requestId = this._requestId;
    }
    if (this._spanId) {
      event.spanId = this._spanId;
    }

    // Add service name if provided
    if (this._service) {
      event.service = this._service;
    }

    // Add custom fields if any
    if (Object.keys(this._fields).length > 0) {
      event.fields = { ...this._fields };
    }

    return event;
  }
}
