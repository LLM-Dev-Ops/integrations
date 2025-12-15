/**
 * AWS CloudWatch Logs Correlation Engine Types
 *
 * Type definitions for correlation-based log queries across multiple log groups.
 *
 * @module correlation/types
 */

/**
 * Type of correlation to perform.
 */
export type CorrelationType = 'trace' | 'request' | 'span';

/**
 * A single correlated log event from CloudWatch Logs.
 *
 * Contains the log message, metadata, and extracted correlation IDs.
 */
export interface CorrelatedEvent {
  /** The log group name where this event was found */
  logGroup: string;

  /** The log stream name where this event was found */
  logStream: string;

  /** Timestamp of the event in milliseconds since epoch */
  timestamp: number;

  /** The raw log message */
  message: string;

  /** Trace ID extracted from the log message (if present) */
  traceId?: string;

  /** Request ID extracted from the log message (if present) */
  requestId?: string;

  /** Span ID extracted from the log message (if present) */
  spanId?: string;

  /** All parsed fields from the log message */
  parsedFields: Record<string, unknown>;
}

/**
 * Result of a correlation query across multiple log groups.
 *
 * Contains all events that match the correlation ID along with metadata
 * about the query.
 */
export interface CorrelationResult {
  /** The correlation ID that was searched for */
  correlationId: string;

  /** The type of correlation performed */
  correlationType: CorrelationType;

  /** All matching log events sorted by timestamp */
  events: CorrelatedEvent[];

  /** Time range that was searched */
  timeRange: { start: Date; end: Date };

  /** Log groups that were searched */
  logGroups: string[];
}
