/**
 * Metrics collection for DynamoDB operations
 */

export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Standard metric names for DynamoDB operations
 */
export const DynamoDBMetricNames = {
  OPERATIONS_TOTAL: 'dynamodb_operations_total',
  OPERATION_DURATION: 'dynamodb_operation_duration_seconds',
  CONSUMED_RCU: 'dynamodb_consumed_rcu_total',
  CONSUMED_WCU: 'dynamodb_consumed_wcu_total',
  THROTTLES: 'dynamodb_throttles_total',
  ERRORS: 'dynamodb_errors_total',
  ITEMS_RETURNED: 'dynamodb_items_returned',
  BATCH_UNPROCESSED: 'dynamodb_batch_unprocessed_items',
  CONDITIONAL_CHECK_FAILURES: 'dynamodb_conditional_check_failures',
} as const;

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {
      counters: {},
      histograms: {},
      gauges: {},
    };

    for (const [key, value] of this.counters.entries()) {
      metrics.counters[key] = value;
    }

    for (const [key, values] of this.histograms.entries()) {
      metrics.histograms[key] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        values,
      };
    }

    for (const [key, value] of this.gauges.entries()) {
      metrics.gauges[key] = value;
    }

    return metrics;
  }

  /**
   * Get a specific counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  /**
   * Get a specific histogram values
   */
  getHistogram(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  /**
   * Get a specific gauge value
   */
  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}:${labelStr}`;
  }
}

/**
 * No-op metrics collector for production environments where metrics are disabled
 */
export class NoopMetricsCollector implements MetricsCollector {
  incrementCounter(_name: string, _value?: number, _labels?: Record<string, string>): void {
    // No-op
  }

  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  recordGauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }
}
