/**
 * Metrics collection for monitoring and observability
 */

export interface MetricsCollector {
  incrementCounter(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private gauges = new Map<string, number>();

  incrementCounter(name: string, value: number, labels?: Record<string, string>): void {
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

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

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
  incrementCounter(_name: string, _value: number, _labels?: Record<string, string>): void {}
  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {}
  setGauge(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/**
 * Standard metric names for Anthropic API integration
 */
export const MetricNames = {
  REQUEST_COUNT: 'anthropic.requests.total',
  REQUEST_DURATION_MS: 'anthropic.requests.duration_ms',
  REQUEST_ERRORS: 'anthropic.requests.errors',
  TOKENS_INPUT: 'anthropic.tokens.input',
  TOKENS_OUTPUT: 'anthropic.tokens.output',
  RATE_LIMIT_HITS: 'anthropic.rate_limit.hits',
  CIRCUIT_BREAKER_STATE: 'anthropic.circuit_breaker.state',
  RETRY_ATTEMPTS: 'anthropic.retry.attempts',
} as const;
