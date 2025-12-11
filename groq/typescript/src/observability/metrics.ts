/**
 * Metrics collection for the Groq client.
 */

/**
 * Request metrics data.
 */
export interface RequestMetrics {
  /** Request ID. */
  requestId?: string;
  /** API endpoint. */
  endpoint: string;
  /** HTTP method. */
  method: string;
  /** HTTP status code. */
  statusCode?: number;
  /** Request duration in milliseconds. */
  durationMs: number;
  /** Tokens used (prompt). */
  promptTokens?: number;
  /** Tokens used (completion). */
  completionTokens?: number;
  /** Total tokens used. */
  totalTokens?: number;
  /** Whether the request succeeded. */
  success: boolean;
  /** Error code if failed. */
  errorCode?: string;
  /** Whether the request was retried. */
  retried: boolean;
  /** Number of retry attempts. */
  retryCount: number;
  /** Model used. */
  model?: string;
  /** Time to first token (for streaming). */
  timeToFirstTokenMs?: number;
}

/**
 * Aggregated metrics.
 */
export interface AggregatedMetrics {
  /** Total number of requests. */
  totalRequests: number;
  /** Successful requests. */
  successfulRequests: number;
  /** Failed requests. */
  failedRequests: number;
  /** Total tokens used. */
  totalTokens: number;
  /** Average latency in milliseconds. */
  averageLatencyMs: number;
  /** 50th percentile latency. */
  p50LatencyMs: number;
  /** 95th percentile latency. */
  p95LatencyMs: number;
  /** 99th percentile latency. */
  p99LatencyMs: number;
  /** Requests by endpoint. */
  byEndpoint: Record<string, number>;
  /** Requests by model. */
  byModel: Record<string, number>;
  /** Errors by code. */
  byErrorCode: Record<string, number>;
}

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  /** Records request metrics. */
  record(metrics: RequestMetrics): void;
  /** Gets aggregated metrics. */
  getAggregated(): AggregatedMetrics;
  /** Resets all metrics. */
  reset(): void;
}

/**
 * Default metrics collector implementation.
 */
export class DefaultMetricsCollector implements MetricsCollector {
  private readonly metrics: RequestMetrics[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  record(metrics: RequestMetrics): void {
    this.metrics.push(metrics);

    // Trim old entries if needed
    if (this.metrics.length > this.maxEntries) {
      this.metrics.shift();
    }
  }

  getAggregated(): AggregatedMetrics {
    const latencies = this.metrics.map((m) => m.durationMs).sort((a, b) => a - b);

    return {
      totalRequests: this.metrics.length,
      successfulRequests: this.metrics.filter((m) => m.success).length,
      failedRequests: this.metrics.filter((m) => !m.success).length,
      totalTokens: this.metrics.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0),
      averageLatencyMs: this.average(latencies),
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      byEndpoint: this.countBy((m) => m.endpoint),
      byModel: this.countBy((m) => m.model ?? 'unknown'),
      byErrorCode: this.countBy((m) => m.errorCode ?? 'none'),
    };
  }

  reset(): void {
    this.metrics.length = 0;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] ?? 0;
  }

  private countBy(keyFn: (m: RequestMetrics) => string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const m of this.metrics) {
      const key = keyFn(m);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }
}

/**
 * No-op metrics collector.
 */
export class NoopMetricsCollector implements MetricsCollector {
  record(): void {}
  getAggregated(): AggregatedMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      byEndpoint: {},
      byModel: {},
      byErrorCode: {},
    };
  }
  reset(): void {}
}

/**
 * Creates a default metrics collector.
 */
export function createMetricsCollector(maxEntries = 1000): MetricsCollector {
  return new DefaultMetricsCollector(maxEntries);
}

/**
 * Creates a no-op metrics collector.
 */
export function createNoopMetricsCollector(): MetricsCollector {
  return new NoopMetricsCollector();
}

/**
 * Timer utility for measuring durations.
 */
export class Timer {
  private readonly startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Stops the timer and returns elapsed milliseconds.
   */
  stop(): number {
    this.endTime = Date.now();
    return this.elapsed();
  }

  /**
   * Returns elapsed milliseconds without stopping.
   */
  elapsed(): number {
    return (this.endTime ?? Date.now()) - this.startTime;
  }

  /**
   * Creates and starts a new timer.
   */
  static start(): Timer {
    return new Timer();
  }
}
