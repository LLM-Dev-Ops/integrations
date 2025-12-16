/**
 * Common types used throughout the Datadog APM integration.
 *
 * Defines tag types and other shared type definitions.
 */

/**
 * Tag value can be a string, number, or boolean
 */
export type TagValue = string | number | boolean;

/**
 * Tags are key-value pairs for categorizing and filtering traces and metrics
 */
export type Tags = Record<string, TagValue>;

/**
 * Carrier type for context propagation (typically HTTP headers)
 */
export type Carrier = Record<string, string | string[] | undefined>;

/**
 * Log correlation context for Datadog
 */
export interface LogContext {
  /**
   * Trace ID for log correlation
   */
  dd_trace_id?: string;

  /**
   * Span ID for log correlation
   */
  dd_span_id?: string;

  /**
   * Service name
   */
  dd_service?: string;

  /**
   * Environment name
   */
  dd_env?: string;

  /**
   * Version
   */
  dd_version?: string;
}
