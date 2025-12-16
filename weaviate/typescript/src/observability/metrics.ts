/**
 * Metrics collector implementations for the Weaviate client.
 *
 * Provides NoopMetricsCollector and InMemoryMetricsCollector.
 */

import { MetricValue, MetricsCollector } from './types';

// ============================================================================
// NoopMetricsCollector Implementation
// ============================================================================

/**
 * No-op metrics collector
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(_name: string, _value?: number, _labels?: Record<string, string>): void {
    // No-op
  }

  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  histogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  recordTiming(_name: string, _durationMs: number, _labels?: Record<string, string>): void {
    // No-op
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map();
  }
}

// ============================================================================
// InMemoryMetricsCollector Implementation
// ============================================================================

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private metrics = new Map<string, MetricValue[]>();
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();

  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    const newValue = current + value;
    this.counters.set(key, newValue);

    this.record(name, newValue, labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);

    this.record(name, value, labels);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.histogram(name, durationMs, labels);
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map(this.metrics);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    const key = this.buildKey(name, labels);
    return this.gauges.get(key);
  }

  /**
   * Get histogram values
   */
  getHistogram(name: string, labels?: Record<string, string>): number[] {
    const key = this.buildKey(name, labels);
    const values = this.metrics.get(key);
    return values?.map((v) => v.value) ?? [];
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string, labels?: Record<string, string>): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | undefined {
    const values = this.getHistogram(name, labels);
    if (values.length === 0) return undefined;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const count = sorted.length;

    return {
      count,
      sum,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
  }

  /**
   * Reset a specific metric
   */
  resetMetric(name: string, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.metrics.delete(key);
    this.counters.delete(key);
    this.gauges.delete(key);
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(new Set(Array.from(this.metrics.keys()).map((key) => key.split('{')[0])));
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const metricNames = this.getMetricNames();

    for (const name of metricNames) {
      // Determine metric type
      const isCounter = this.counters.has(name);
      const isGauge = this.gauges.has(name);
      const type = isCounter ? 'counter' : isGauge ? 'gauge' : 'histogram';

      lines.push(`# TYPE ${name} ${type}`);

      // Get all label combinations for this metric
      const entries = Array.from(this.metrics.entries()).filter(([key]) =>
        key.startsWith(name)
      );

      for (const [key, values] of entries) {
        const latestValue = values[values.length - 1];
        const labelsStr = key.includes('{') ? key.substring(key.indexOf('{')) : '';
        lines.push(`${name}${labelsStr} ${latestValue.value}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private record(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const values = this.metrics.get(key) ?? [];
    values.push({
      value,
      timestamp: Date.now(),
      labels,
    });
    this.metrics.set(key, values);
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a metrics collector based on configuration
 */
export function createMetricsCollector(options?: {
  enabled?: boolean;
  type?: 'memory' | 'noop';
}): MetricsCollector {
  if (options?.enabled === false || options?.type === 'noop') {
    return new NoopMetricsCollector();
  }

  if (options?.type === 'memory') {
    return new InMemoryMetricsCollector();
  }

  // Default to noop
  return new NoopMetricsCollector();
}
