/**
 * Datadog APM client implementation.
 *
 * Provides the main implementation of the DatadogAPMClient interface,
 * integrating with dd-trace for tracing and hot-shots for metrics.
 */

import type { DatadogAPMClient } from './interface.js';
import type { Span } from '../tracing/index.js';
import { Tracer } from '../tracing/index.js';
import type {
  SpanOptions,
  Tags,
  Carrier,
  SpanContext,
  LogContext,
  DatadogAPMConfig,
} from '../types/index.js';
import { SpanType } from '../types/index.js';
import type { LLMSpan, LLMSpanOptions } from '../llm/interface.js';
import { LLMSpanImpl } from '../llm/span.js';
import type { AgentSpan, AgentSpanOptions } from '../agent/interface.js';
import { AgentSpanImpl, AGENT_TAGS } from '../agent/span.js';
import { LLM_TAGS } from '../llm/tags.js';
import { Timer } from '../metrics/timer.js';
import type { MetricsClient } from '../metrics/interface.js';

/**
 * Simplified interface for dd-trace tracer
 */
interface DatadogTracerWrapper {
  startSpan(name: string, options?: Record<string, unknown>): any;
  scope(): {
    active(): any | null;
  };
  inject(spanContext: unknown, format: string, carrier: Carrier): void;
  extract(format: string, carrier: Carrier): unknown | null;
}

/**
 * Simplified interface for hot-shots StatsD client
 */
interface StatsDClient {
  increment(stat: string, value?: number, tags?: string[]): void;
  gauge(stat: string, value: number, tags?: string[]): void;
  histogram(stat: string, value: number, tags?: string[]): void;
  distribution(stat: string, value: number, tags?: string[]): void;
  close(callback?: (error?: Error) => void): void;
}

/**
 * Implementation of the DatadogAPMClient interface.
 *
 * This class:
 * - Wraps dd-trace for distributed tracing
 * - Wraps hot-shots StatsD client for metrics
 * - Manages lifecycle (initialization, flushing, shutdown)
 * - Provides log correlation context
 */
export class DatadogAPMClientImpl implements DatadogAPMClient {
  private readonly tracer: Tracer;
  private readonly statsD?: StatsDClient;
  private readonly config: DatadogAPMConfig;
  private isShutdown = false;

  /**
   * Create a new Datadog APM client.
   *
   * @param ddTracer - dd-trace tracer instance
   * @param statsD - Optional hot-shots StatsD client for metrics
   * @param config - Configuration options
   */
  constructor(
    ddTracer: DatadogTracerWrapper,
    statsD: StatsDClient | undefined,
    config: DatadogAPMConfig
  ) {
    this.tracer = new Tracer(ddTracer, config.redactionRules || []);
    this.statsD = statsD;
    this.config = config;
  }

  startSpan(name: string, options?: SpanOptions): Span {
    this.ensureNotShutdown();
    return this.tracer.startSpan(name, options);
  }

  getCurrentSpan(): Span | null {
    this.ensureNotShutdown();
    return this.tracer.getCurrentSpan();
  }

  injectContext(carrier: Carrier): void {
    this.ensureNotShutdown();
    this.tracer.injectContext(carrier);
  }

  extractContext(carrier: Carrier): SpanContext | null {
    this.ensureNotShutdown();
    return this.tracer.extractContext(carrier);
  }

  increment(name: string, value: number = 1, tags?: Tags): void {
    this.ensureNotShutdown();

    if (!this.statsD) {
      this.config.logger?.warn('StatsD client not available, metric not recorded', {
        metric: name,
        type: 'increment',
      });
      return;
    }

    const metricName = this.formatMetricName(name);
    const metricTags = this.formatTags(tags);

    this.statsD.increment(metricName, value, metricTags);
  }

  gauge(name: string, value: number, tags?: Tags): void {
    this.ensureNotShutdown();

    if (!this.statsD) {
      this.config.logger?.warn('StatsD client not available, metric not recorded', {
        metric: name,
        type: 'gauge',
      });
      return;
    }

    const metricName = this.formatMetricName(name);
    const metricTags = this.formatTags(tags);

    this.statsD.gauge(metricName, value, metricTags);
  }

  histogram(name: string, value: number, tags?: Tags): void {
    this.ensureNotShutdown();

    if (!this.statsD) {
      this.config.logger?.warn('StatsD client not available, metric not recorded', {
        metric: name,
        type: 'histogram',
      });
      return;
    }

    const metricName = this.formatMetricName(name);
    const metricTags = this.formatTags(tags);

    this.statsD.histogram(metricName, value, metricTags);
  }

  distribution(name: string, value: number, tags?: Tags): void {
    this.ensureNotShutdown();

    if (!this.statsD) {
      this.config.logger?.warn('StatsD client not available, metric not recorded', {
        metric: name,
        type: 'distribution',
      });
      return;
    }

    const metricName = this.formatMetricName(name);
    const metricTags = this.formatTags(tags);

    this.statsD.distribution(metricName, value, metricTags);
  }

  getLogContext(): LogContext | null {
    this.ensureNotShutdown();

    const activeSpan = this.getCurrentSpan();
    if (!activeSpan) {
      return null;
    }

    return {
      dd_trace_id: activeSpan.traceId,
      dd_span_id: activeSpan.spanId,
      dd_service: this.config.service,
      dd_env: this.config.env,
      dd_version: this.config.version,
    };
  }

  async flush(): Promise<void> {
    this.ensureNotShutdown();

    // dd-trace doesn't expose a public flush method in the standard API,
    // but traces are typically flushed automatically based on the flush interval.
    // For metrics, we don't need to explicitly flush StatsD as it uses UDP.

    this.config.logger?.debug('Flush requested (traces and metrics are flushed automatically)');

    // Add a small delay to allow pending operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.config.logger?.info('Shutting down Datadog APM client');

    // Flush any pending data
    await this.flush();

    // Close StatsD client
    if (this.statsD) {
      await new Promise<void>((resolve, reject) => {
        this.statsD!.close((error) => {
          if (error) {
            this.config.logger?.error('Error closing StatsD client', { error });
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    this.isShutdown = true;
    this.config.logger?.info('Datadog APM client shut down successfully');
  }

  /**
   * Format metric name with prefix if configured.
   */
  private formatMetricName(name: string): string {
    const prefix = this.config.metricsPrefix;
    if (!prefix) {
      return name;
    }
    return `${prefix}.${name}`;
  }

  /**
   * Format tags for StatsD.
   *
   * Converts tag object to array of "key:value" strings,
   * including global tags.
   */
  private formatTags(tags?: Tags): string[] {
    const allTags: Tags = {
      ...(this.config.globalTags || {}),
      ...(tags || {}),
    };

    return Object.entries(allTags).map(([key, value]) => `${key}:${value}`);
  }

  /**
   * Ensure the client has not been shut down.
   */
  private ensureNotShutdown(): void {
    if (this.isShutdown) {
      throw new Error('Client has been shut down');
    }
  }

  startLLMSpan(name: string, options: LLMSpanOptions): LLMSpan {
    this.ensureNotShutdown();

    // Create base span with LLM type
    const baseSpan = this.startSpan(name, {
      type: SpanType.LLM,
      resource: `${options.provider}.${options.model}`,
      tags: {
        [LLM_TAGS.PROVIDER]: options.provider,
        [LLM_TAGS.MODEL]: options.model,
        [LLM_TAGS.REQUEST_TYPE]: options.requestType,
        ...(options.streaming !== undefined && { [LLM_TAGS.STREAMING]: options.streaming }),
        ...(options.maxTokens !== undefined && { [LLM_TAGS.MAX_TOKENS]: options.maxTokens }),
        ...(options.temperature !== undefined && { [LLM_TAGS.TEMPERATURE]: options.temperature }),
        ...(options.topP !== undefined && { [LLM_TAGS.TOP_P]: options.topP }),
      },
      childOf: options.parentSpan?.context(),
    });

    // Wrap in LLMSpan implementation
    return new LLMSpanImpl(baseSpan, this, options.provider, options.model);
  }

  async traceLLM<T>(
    name: string,
    options: LLMSpanOptions,
    fn: (span: LLMSpan) => Promise<T>
  ): Promise<T> {
    this.ensureNotShutdown();

    const span = this.startLLMSpan(name, options);

    try {
      const result = await fn(span);
      return result;
    } catch (error) {
      span.setError(error as Error);
      throw error;
    } finally {
      span.finish();
    }
  }

  startAgentSpan(name: string, options: AgentSpanOptions): AgentSpan {
    this.ensureNotShutdown();

    // Create base span with Agent type
    const baseSpan = this.startSpan(name, {
      type: SpanType.AGENT,
      resource: options.agentName,
      tags: {
        [AGENT_TAGS.NAME]: options.agentName,
        ...(options.agentType && { [AGENT_TAGS.TYPE]: options.agentType }),
      },
      childOf: options.parentSpan?.context(),
    });

    // Wrap in AgentSpan implementation
    return new AgentSpanImpl(
      baseSpan,
      this,
      options.agentName,
      options.agentType || 'agent'
    );
  }

  async traceAgent<T>(
    name: string,
    options: AgentSpanOptions,
    fn: (span: AgentSpan) => Promise<T>
  ): Promise<T> {
    this.ensureNotShutdown();

    const span = this.startAgentSpan(name, options);

    try {
      const result = await fn(span);
      return result;
    } catch (error) {
      span.setError(error as Error);
      throw error;
    } finally {
      span.finish();
    }
  }

  async trace<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    this.ensureNotShutdown();

    const span = this.startSpan(name, options);

    try {
      const result = await fn(span);
      return result;
    } catch (error) {
      span.setError(error as Error);
      throw error;
    } finally {
      span.finish();
    }
  }

  startTimer(name: string, tags?: Tags): Timer {
    this.ensureNotShutdown();

    // Create metrics client wrapper for the timer
    const metricsClient: MetricsClient = {
      increment: (n: string, v?: number, t?: Tags) => this.increment(n, v, t),
      decrement: (n: string, v?: number, t?: Tags) => this.increment(n, -(v ?? 1), t),
      gauge: (n: string, v: number, t?: Tags) => this.gauge(n, v, t),
      histogram: (n: string, v: number, t?: Tags) => this.histogram(n, v, t),
      distribution: (n: string, v: number, t?: Tags) => this.distribution(n, v, t),
      timing: (n: string, v: number, t?: Tags) => this.histogram(n, v, t),
      set: (_n: string, _v: string | number, _t?: Tags) => {
        // StatsD set is not commonly used, can be implemented if needed
      },
      flush: async () => this.flush(),
      close: async () => this.shutdown(),
    };

    return new Timer(metricsClient, name, tags);
  }
}
