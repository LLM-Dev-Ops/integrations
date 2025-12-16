/**
 * Span interface for Datadog APM tracing.
 *
 * Defines the public API for working with spans in distributed tracing.
 */

import type { Tags, TagValue } from '../types';
import type { SpanContext } from '../types';

/**
 * Span represents a single unit of work in a distributed trace.
 *
 * This interface wraps the underlying dd-trace span and provides:
 * - Consistent API for span operations
 * - Automatic redaction of sensitive data
 * - Event tracking via timestamped tags
 * - Error handling with structured tags
 */
export interface Span {
  /**
   * Trace ID (128-bit hex string)
   */
  readonly traceId: string;

  /**
   * Span ID (64-bit hex string)
   */
  readonly spanId: string;

  /**
   * Parent span ID (64-bit hex string), if any
   */
  readonly parentId?: string;

  /**
   * Span name (operation name)
   */
  readonly name: string;

  /**
   * Service name
   */
  readonly service: string;

  /**
   * Resource name (e.g., endpoint path, query, function name)
   */
  readonly resource: string;

  /**
   * Start time in milliseconds since epoch
   */
  readonly startTime: number;

  /**
   * Duration in milliseconds (only available after span is finished)
   */
  readonly duration?: number;

  /**
   * Tags attached to the span
   */
  readonly tags: Readonly<Tags>;

  /**
   * Error indicator (0 = no error, 1 = error)
   */
  readonly error?: number;

  /**
   * Metrics attached to the span
   */
  readonly metrics: Readonly<Record<string, number>>;

  /**
   * Set a tag on the span.
   *
   * Tags are key-value pairs used for filtering and grouping traces.
   * Redaction rules are automatically applied to tag values.
   *
   * @param key - Tag key
   * @param value - Tag value (string, number, or boolean)
   * @returns The span instance for method chaining
   *
   * @example
   * ```typescript
   * span
   *   .setTag('http.method', 'GET')
   *   .setTag('http.status_code', 200)
   *   .setTag('user.authenticated', true);
   * ```
   */
  setTag(key: string, value: TagValue): Span;

  /**
   * Mark the span as errored and attach error information.
   *
   * This automatically sets:
   * - error tag to 1
   * - error.type to the error class name
   * - error.message to the error message
   * - error.stack to the error stack trace (if available)
   *
   * @param error - Error object or error message
   * @returns The span instance for method chaining
   *
   * @example
   * ```typescript
   * try {
   *   // some operation
   * } catch (error) {
   *   span.setError(error);
   * }
   * ```
   */
  setError(error: Error | string): Span;

  /**
   * Add an event to the span.
   *
   * Since Datadog doesn't have native span events, this is implemented
   * as timestamped tags:
   * - event.<name>.timestamp = <ISO timestamp>
   * - event.<name>.<attr_key> = <attr_value>
   *
   * @param name - Event name
   * @param attributes - Optional event attributes
   * @returns The span instance for method chaining
   *
   * @example
   * ```typescript
   * span.addEvent('cache.hit', { key: 'user:123' });
   * span.addEvent('retry.attempt', { attempt: 2, delay_ms: 1000 });
   * ```
   */
  addEvent(name: string, attributes?: Tags): Span;

  /**
   * Finish the span and record its duration.
   *
   * Once finished, the span is sent to the Datadog agent.
   * A finished span cannot be modified.
   *
   * @param endTime - Optional end time in milliseconds since epoch (defaults to now)
   *
   * @example
   * ```typescript
   * const span = client.startSpan('database.query');
   * try {
   *   const result = await db.query('SELECT * FROM users');
   *   span.setTag('rows.count', result.rows.length);
   * } finally {
   *   span.finish();
   * }
   * ```
   */
  finish(endTime?: number): void;

  /**
   * Get the span context for propagation.
   *
   * The span context contains trace and span IDs needed for
   * distributed tracing across service boundaries.
   *
   * @returns Span context with trace ID, span ID, and parent ID
   *
   * @example
   * ```typescript
   * const context = span.context();
   * // Propagate context to downstream service
   * headers['x-datadog-trace-id'] = context.traceId;
   * headers['x-datadog-parent-id'] = context.spanId;
   * ```
   */
  context(): SpanContext;
}
