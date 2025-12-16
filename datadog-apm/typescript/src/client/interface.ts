/**
 * Datadog APM client interface.
 *
 * Defines the public API for interacting with Datadog APM, including:
 * - Distributed tracing (spans)
 * - Metrics (counters, gauges, histograms, distributions)
 * - Context propagation
 * - Log correlation
 */

import type { Span } from '../tracing/index.js';
import type { SpanOptions, Tags, Carrier, SpanContext, LogContext } from '../types/index.js';
import type { LLMSpan, LLMSpanOptions } from '../llm/interface.js';
import type { AgentSpan, AgentSpanOptions } from '../agent/interface.js';
import type { Timer } from '../metrics/timer.js';

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

  /**
   * Start a new LLM span for tracing LLM operations.
   *
   * @param name - Operation name for the LLM span
   * @param options - LLM span configuration
   * @returns A new LLMSpan instance
   *
   * @example
   * ```typescript
   * const span = client.startLLMSpan('chat.completion', {
   *   provider: 'anthropic',
   *   model: 'claude-3-opus-20240229',
   *   requestType: LLMRequestType.CHAT,
   *   maxTokens: 4096,
   *   temperature: 1.0
   * });
   *
   * try {
   *   const response = await anthropic.messages.create({...});
   *   span.recordTokens(response.usage.input_tokens, response.usage.output_tokens);
   *   span.setFinishReason(response.stop_reason);
   * } catch (error) {
   *   span.setError(error);
   *   throw error;
   * } finally {
   *   span.finish();
   * }
   * ```
   */
  startLLMSpan(name: string, options: LLMSpanOptions): LLMSpan;

  /**
   * Trace an LLM operation with automatic span management.
   *
   * Convenience wrapper that creates an LLM span, executes the function,
   * and automatically finishes the span (even if an error occurs).
   *
   * @param name - Operation name for the LLM span
   * @param options - LLM span configuration
   * @param fn - Function to execute within the span context
   * @returns Promise resolving to the function's result
   *
   * @example
   * ```typescript
   * const response = await client.traceLLM(
   *   'chat.completion',
   *   {
   *     provider: 'anthropic',
   *     model: 'claude-3-opus-20240229',
   *     requestType: LLMRequestType.CHAT
   *   },
   *   async (span) => {
   *     const result = await anthropic.messages.create({...});
   *     span.recordTokens(result.usage.input_tokens, result.usage.output_tokens);
   *     span.setFinishReason(result.stop_reason);
   *     return result;
   *   }
   * );
   * ```
   */
  traceLLM<T>(
    name: string,
    options: LLMSpanOptions,
    fn: (span: LLMSpan) => Promise<T>
  ): Promise<T>;

  /**
   * Start a new agent span for tracing AI agent operations.
   *
   * @param name - Operation name for the agent span
   * @param options - Agent span configuration
   * @returns A new AgentSpan instance
   *
   * @example
   * ```typescript
   * const span = client.startAgentSpan('code.agent', {
   *   agentName: 'code-assistant',
   *   agentType: 'coding'
   * });
   *
   * try {
   *   const step1 = span.startStep('analyze', { stepNumber: 1, stepType: 'analysis' });
   *   // ... perform analysis
   *   step1.finish();
   *
   *   span.recordToolCall('file_search', 120, true);
   *   span.setTotalSteps(3);
   * } catch (error) {
   *   span.setError(error);
   *   throw error;
   * } finally {
   *   span.finish();
   * }
   * ```
   */
  startAgentSpan(name: string, options: AgentSpanOptions): AgentSpan;

  /**
   * Trace an agent operation with automatic span management.
   *
   * Convenience wrapper that creates an agent span, executes the function,
   * and automatically finishes the span (even if an error occurs).
   *
   * @param name - Operation name for the agent span
   * @param options - Agent span configuration
   * @param fn - Function to execute within the span context
   * @returns Promise resolving to the function's result
   *
   * @example
   * ```typescript
   * const result = await client.traceAgent(
   *   'code.agent',
   *   { agentName: 'code-assistant', agentType: 'coding' },
   *   async (span) => {
   *     const step = span.startStep('plan', { stepNumber: 1 });
   *     const plan = await generatePlan();
   *     step.finish();
   *     return plan;
   *   }
   * );
   * ```
   */
  traceAgent<T>(
    name: string,
    options: AgentSpanOptions,
    fn: (span: AgentSpan) => Promise<T>
  ): Promise<T>;

  /**
   * Trace a generic operation with automatic span management.
   *
   * Convenience wrapper that creates a span, executes the function,
   * and automatically finishes the span (even if an error occurs).
   *
   * @param name - Operation name for the span
   * @param fn - Function to execute within the span context
   * @param options - Optional span configuration
   * @returns Promise resolving to the function's result
   *
   * @example
   * ```typescript
   * const result = await client.trace(
   *   'database.query',
   *   async (span) => {
   *     span.setTag('db.system', 'postgresql');
   *     const result = await db.query('SELECT * FROM users');
   *     span.setTag('rows.count', result.rows.length);
   *     return result;
   *   },
   *   { type: SpanType.SQL }
   * );
   * ```
   */
  trace<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T>;

  /**
   * Start a timer for measuring operation duration.
   *
   * Returns a Timer instance that can be stopped to record a timing metric.
   *
   * @param name - Metric name
   * @param tags - Optional tags for the metric
   * @returns Timer instance
   *
   * @example
   * ```typescript
   * const timer = client.startTimer('api.request.duration', {
   *   endpoint: '/users',
   *   method: 'GET'
   * });
   *
   * try {
   *   await processRequest();
   * } finally {
   *   timer.stop(); // Records the timing metric
   * }
   * ```
   */
  startTimer(name: string, tags?: Tags): Timer;
}
