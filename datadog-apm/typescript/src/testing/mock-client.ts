/**
 * Mock Datadog APM client for testing
 *
 * @module testing/mock-client
 */

import type { Tags, TagValue } from '../types/common.js';
import type { SpanContext } from '../types/span.js';
import { MockSpan, CapturedSpan } from './mock-span.js';

/**
 * Captured metric structure
 */
export interface CapturedMetric {
  type: 'counter' | 'gauge' | 'histogram' | 'distribution' | 'timing' | 'set';
  name: string;
  value: number;
  tags: Tags;
  timestamp: number;
}

/**
 * Captured log structure
 */
export interface CapturedLog {
  level: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: number;
}

/**
 * Mock span options
 */
export interface MockSpanOptions {
  resource?: string;
  type?: string;
  tags?: Record<string, TagValue>;
  childOf?: MockSpan | SpanContext;
  startTime?: number;
}

/**
 * Mock Datadog APM client for testing without network dependency
 */
export class MockDatadogAPMClient {
  private spans: CapturedSpan[] = [];
  private metrics: CapturedMetric[] = [];
  private logs: CapturedLog[] = [];
  private activeSpan: MockSpan | null = null;
  private isShutdown = false;

  readonly config = {
    service: 'test-service',
    env: 'test',
    version: '0.0.0',
  };

  /**
   * Start a new span
   */
  startSpan(name: string, options?: MockSpanOptions): MockSpan {
    const parentId =
      options?.childOf instanceof MockSpan
        ? options.childOf.spanId
        : (options?.childOf as SpanContext)?.spanId;

    const span = new MockSpan(name, {
      parentId,
      resource: options?.resource,
      type: options?.type,
      tags: options?.tags,
    });

    this.activeSpan = span;
    return span;
  }

  /**
   * Get the current active span
   */
  getCurrentSpan(): MockSpan | null {
    return this.activeSpan;
  }

  /**
   * Inject context into a carrier (mock implementation)
   */
  injectContext(carrier: { set(key: string, value: string): void }): void {
    if (this.activeSpan) {
      const context = this.activeSpan.context();
      carrier.set('x-datadog-trace-id', context.traceId);
      carrier.set('x-datadog-parent-id', context.spanId);
      carrier.set('x-datadog-sampling-priority', String(context.samplingPriority ?? 1));
    }
  }

  /**
   * Extract context from a carrier (mock implementation)
   */
  extractContext(carrier: { get(key: string): string | null }): SpanContext | null {
    const traceId = carrier.get('x-datadog-trace-id');
    const spanId = carrier.get('x-datadog-parent-id');

    if (!traceId || !spanId) {
      return null;
    }

    const samplingPriority = carrier.get('x-datadog-sampling-priority');

    return {
      traceId,
      spanId,
      samplingPriority: samplingPriority ? parseInt(samplingPriority, 10) : undefined,
    };
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, value: number = 1, tags?: Tags): void {
    if (this.isShutdown) return;

    this.metrics.push({
      type: 'counter',
      name,
      value,
      tags: tags ?? {},
      timestamp: Date.now(),
    });
  }

  /**
   * Decrement a counter metric
   */
  decrement(name: string, value: number = 1, tags?: Tags): void {
    this.increment(name, -value, tags);
  }

  /**
   * Set a gauge metric
   */
  gauge(name: string, value: number, tags?: Tags): void {
    if (this.isShutdown) return;

    this.metrics.push({
      type: 'gauge',
      name,
      value,
      tags: tags ?? {},
      timestamp: Date.now(),
    });
  }

  /**
   * Record a histogram metric
   */
  histogram(name: string, value: number, tags?: Tags): void {
    if (this.isShutdown) return;

    this.metrics.push({
      type: 'histogram',
      name,
      value,
      tags: tags ?? {},
      timestamp: Date.now(),
    });
  }

  /**
   * Record a distribution metric
   */
  distribution(name: string, value: number, tags?: Tags): void {
    if (this.isShutdown) return;

    this.metrics.push({
      type: 'distribution',
      name,
      value,
      tags: tags ?? {},
      timestamp: Date.now(),
    });
  }

  /**
   * Record a timing metric
   */
  timing(name: string, value: number, tags?: Tags): void {
    this.histogram(name, value, tags);
  }

  /**
   * Get log context for correlation
   */
  getLogContext(): Record<string, unknown> | null {
    if (!this.activeSpan) {
      return null;
    }

    const context = this.activeSpan.context();
    return {
      dd: {
        trace_id: context.traceId,
        span_id: context.spanId,
        service: this.config.service,
        env: this.config.env,
        version: this.config.version,
      },
    };
  }

  /**
   * Flush pending telemetry (no-op for mock)
   */
  async flush(): Promise<void> {
    // Capture all active spans
    if (this.activeSpan && !this.activeSpan.isFinished()) {
      this.spans.push(this.activeSpan.getCaptured());
    }
  }

  /**
   * Shutdown the client (no-op for mock)
   */
  async shutdown(): Promise<void> {
    await this.flush();
    this.isShutdown = true;
  }

  // ==================== Test Helpers ====================

  /**
   * Record a finished span
   */
  recordSpan(span: MockSpan): void {
    this.spans.push(span.getCaptured());
  }

  /**
   * Get all captured spans
   */
  getSpans(filter?: { name?: string; tags?: Tags }): CapturedSpan[] {
    let result = [...this.spans];

    if (filter?.name) {
      result = result.filter((s) => s.name === filter.name);
    }

    if (filter?.tags) {
      result = result.filter((s) =>
        Object.entries(filter.tags!).every(([k, v]) => s.tags[k] === v)
      );
    }

    return result;
  }

  /**
   * Get a span by name
   */
  getSpanByName(name: string): CapturedSpan | undefined {
    return this.spans.find((s) => s.name === name);
  }

  /**
   * Get all captured metrics
   */
  getMetrics(filter?: { name?: string; type?: CapturedMetric['type'] }): CapturedMetric[] {
    let result = [...this.metrics];

    if (filter?.name) {
      result = result.filter((m) => m.name === filter.name);
    }

    if (filter?.type) {
      result = result.filter((m) => m.type === filter.type);
    }

    return result;
  }

  /**
   * Get metrics by prefix
   */
  getMetricsByPrefix(prefix: string): CapturedMetric[] {
    return this.metrics.filter((m) => m.name.startsWith(prefix));
  }

  /**
   * Reset all captured data
   */
  reset(): void {
    this.spans = [];
    this.metrics = [];
    this.logs = [];
    this.activeSpan = null;
    this.isShutdown = false;
  }

  /**
   * Check if client is shut down
   */
  isShutdownState(): boolean {
    return this.isShutdown;
  }
}
