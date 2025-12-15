/**
 * AWS CloudWatch Logs Structured Event Types
 *
 * This module contains type definitions for structured log events with correlation support.
 */

/**
 * Log level enumeration.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Structured log event with correlation support.
 */
export interface StructuredLogEvent {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp in milliseconds since epoch (auto-generated if not provided) */
  timestamp?: number;
  /** Trace ID for distributed tracing correlation */
  traceId?: string;
  /** Request ID for request-level correlation */
  requestId?: string;
  /** Span ID for trace span correlation */
  spanId?: string;
  /** Service name that emitted the log */
  service?: string;
  /** Additional structured fields */
  fields?: Record<string, unknown>;
}

/**
 * Time range for queries.
 */
export interface TimeRange {
  /** Start time (inclusive) */
  start: Date;
  /** End time (inclusive) */
  end: Date;
}

/**
 * Correlated log event with parsed fields from CloudWatch Logs Insights.
 */
export interface CorrelatedLogEvent {
  /** Timestamp of the log event */
  timestamp: Date;
  /** Log message */
  message: string;
  /** Log group name */
  logGroup: string;
  /** Log stream name */
  logStream: string;
  /** Trace ID extracted from the log */
  traceId?: string;
  /** Request ID extracted from the log */
  requestId?: string;
  /** Span ID extracted from the log */
  spanId?: string;
  /** Service name extracted from the log */
  service?: string;
  /** Log level extracted from the log */
  level?: LogLevel;
  /** Additional parsed fields from the log */
  fields: Record<string, unknown>;
}
