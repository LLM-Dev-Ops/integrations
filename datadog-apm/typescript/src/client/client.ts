/**
 * Datadog APM client implementation.
 *
 * Provides the main implementation of the DatadogAPMClient interface,
 * integrating with dd-trace for tracing and hot-shots for metrics.
 */

import type { DatadogAPMClient } from './interface';
import type { Span } from '../tracing';
import { Tracer } from '../tracing';
import type {
  SpanOptions,
  Tags,
  Carrier,
  SpanContext,
  LogContext,
  DatadogAPMConfig,
} from '../types';

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
}
