/**
 * Datadog APM client interface.
 *
 * Defines the public API for interacting with Datadog APM, including:
 * - Distributed tracing (spans)
 * - Metrics (counters, gauges, histograms, distributions)
 * - Context propagation
 * - Log correlation
 */

import type { Span } from '../tracing';
import type { SpanOptions, Tags, Carrier, SpanContext, LogContext } from '../types';

/**
 * DatadogAPMClient provides the main interface for Datadog APM operations.
 *
 * This interface supports:
 * - Creating and managing distributed traces via spans
 * - Recording custom metrics (counters, gauges, histograms, distributions)
 * - Propagating trace context across service boundaries
 * - Correlating logs with traces
 * - Graceful shutdown and flushing
 */
export interface DatadogAPMClient {
  /**
   * Start a new span for distributed tracing.
   *
   * @param name - Operation name for the span
   * @param options - Optional span configuration
   * @returns A new Span instance
   *
   * @example
   * ```typescript
   * const span = client.startSpan('database.query', {
   *   resource: 'SELECT * FROM users',
   *   type: SpanType.SQL,
   *   tags: {
   *     'db.system': 'postgresql',
   *     'db.name': 'myapp'
   *   }
   * });
   *
   * try {
   *   const result = await db.query('SELECT * FROM users');
   *   span.setTag('rows.count', result.rows.length);
   * } catch (error) {
   *   span.setError(error);
   *   throw error;
   * } finally {
   *   span.finish();
   * }
   * ```
   */
  startSpan(name: string, options?: SpanOptions): Span;

  /**
   * Get the currently active span.
   *
   * Returns the span that is currently in scope, or null if no span is active.
   *
   * @returns The active span, or null if no span is active
   *
   * @example
   * ```typescript
   * const activeSpan = client.getCurrentSpan();
   * if (activeSpan) {
   *   activeSpan.setTag('user.id', userId);
   * }
   * ```
   */
  getCurrentSpan(): Span | null;

  /**
   * Inject trace context into a carrier for propagation.
   *
   * Used to propagate trace context across service boundaries,
   * typically via HTTP headers.
   *
   * @param carrier - Carrier object (typically HTTP headers)
   *
   * @example
   * ```typescript
   * const headers: Record<string, string> = {};
   * client.injectContext(headers);
   *
   * // Make HTTP request with trace context
   * await fetch('https://api.example.com/users', {
   *   headers
   * });
   * ```
   */
  injectContext(carrier: Carrier): void;

  /**
   * Extract trace context from a carrier.
   *
   * Used to continue a trace that was started in another service,
   * typically from HTTP headers.
   *
   * @param carrier - Carrier object (typically HTTP headers)
   * @returns Extracted span context, or null if no context found
   *
   * @example
   * ```typescript
   * // In an HTTP request handler
   * const context = client.extractContext(request.headers);
   * const span = client.startSpan('handle.request', {
   *   childOf: context || undefined
   * });
   * ```
   */
  extractContext(carrier: Carrier): SpanContext | null;

  /**
   * Increment a counter metric.
   *
   * Counters track the number of times something happens.
   *
   * @param name - Metric name
   * @param value - Value to increment by (defaults to 1)
   * @param tags - Optional tags for the metric
   *
   * @example
   * ```typescript
   * client.increment('api.requests', 1, {
   *   endpoint: '/users',
   *   method: 'GET'
   * });
   * ```
   */
  increment(name: string, value?: number, tags?: Tags): void;

  /**
   * Set a gauge metric value.
   *
   * Gauges track a value that can go up or down over time.
   *
   * @param name - Metric name
   * @param value - Gauge value
   * @param tags - Optional tags for the metric
   *
   * @example
   * ```typescript
   * client.gauge('api.active_connections', connectionCount, {
   *   region: 'us-east-1'
   * });
   * ```
   */
  gauge(name: string, value: number, tags?: Tags): void;

  /**
   * Record a histogram metric value.
   *
   * Histograms track the statistical distribution of values.
   *
   * @param name - Metric name
   * @param value - Value to record
   * @param tags - Optional tags for the metric
   *
   * @example
   * ```typescript
   * client.histogram('api.request.duration', durationMs, {
   *   endpoint: '/users',
   *   status_code: '200'
   * });
   * ```
   */
  histogram(name: string, value: number, tags?: Tags): void;

  /**
   * Record a distribution metric value.
   *
   * Distributions are similar to histograms but provide more accurate percentiles.
   *
   * @param name - Metric name
   * @param value - Value to record
   * @param tags - Optional tags for the metric
   *
   * @example
   * ```typescript
   * client.distribution('database.query.duration', queryTimeMs, {
   *   query_type: 'SELECT',
   *   table: 'users'
   * });
   * ```
   */
  distribution(name: string, value: number, tags?: Tags): void;

  /**
   * Get log correlation context.
   *
   * Returns trace and span IDs that can be included in logs
   * to correlate them with traces in Datadog.
   *
   * @returns Log context with trace and span IDs, or null if no active span
   *
   * @example
   * ```typescript
   * const logContext = client.getLogContext();
   * if (logContext) {
   *   logger.info('Processing request', {
   *     ...logContext,
   *     user_id: userId
   *   });
   * }
   * ```
   */
  getLogContext(): LogContext | null;

  /**
   * Flush all pending traces and metrics.
   *
   * Forces immediate submission of buffered data to the Datadog agent.
   *
   * @returns Promise that resolves when flush is complete
   *
   * @example
   * ```typescript
   * // Before shutting down
   * await client.flush();
   * ```
   */
  flush(): Promise<void>;

  /**
   * Shutdown the client gracefully.
   *
   * Flushes all pending data and closes connections to the Datadog agent.
   * The client cannot be used after shutdown.
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   await client.shutdown();
   *   process.exit(0);
   * });
   * ```
   */
  shutdown(): Promise<void>;
}
