/**
 * Metric value with labels.
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

/**
 * Metrics collector interface.
 */
export interface MetricsCollector {
  /** Increment a counter metric */
  increment(name: string, value?: number, labels?: Record<string, string>): void;
  /** Set a gauge metric */
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  /** Record a histogram value */
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  /** Record timing (duration in milliseconds) */
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void;
  /** Start a timer that returns a function to stop and record */
  startTimer(name: string, labels?: Record<string, string>): () => void;
  /** Get all collected metrics */
  getMetrics(): Map<string, MetricValue[]>;
  /** Reset all metrics */
  reset(): void;
}

/**
 * No-op metrics collector that does nothing.
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(): void {}
  gauge(): void {}
  histogram(): void {}
  recordTiming(): void {}
  startTimer(): () => void {
    return () => {};
  }
  getMetrics(): Map<string, MetricValue[]> {
    return new Map();
  }
  reset(): void {}
}

/**
 * In-memory metrics collector for tracking metrics.
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly prefix: string;
  private metrics: Map<string, MetricValue[]> = new Map();

  constructor(prefix: string = 'milvus') {
    this.prefix = prefix;
  }

  private getFullName(name: string): string {
    return `${this.prefix}_${name}`;
  }

  private addValue(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    const fullName = this.getFullName(name);
    const values = this.metrics.get(fullName) ?? [];
    values.push({
      value,
      timestamp: Date.now(),
      labels,
    });
    this.metrics.set(fullName, values);
  }

  increment(
    name: string,
    value: number = 1,
    labels: Record<string, string> = {}
  ): void {
    this.addValue(name, value, labels);
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.addValue(name, value, labels);
  }

  histogram(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    this.addValue(name, value, labels);
  }

  recordTiming(
    name: string,
    durationMs: number,
    labels: Record<string, string> = {}
  ): void {
    this.addValue(`${name}_duration_ms`, durationMs, labels);
  }

  startTimer(
    name: string,
    labels: Record<string, string> = {}
  ): () => void {
    const startTime = Date.now();
    return () => {
      const durationMs = Date.now() - startTime;
      this.recordTiming(name, durationMs, labels);
    };
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map(this.metrics);
  }

  reset(): void {
    this.metrics.clear();
  }

  /**
   * Get total count for a counter metric.
   */
  getCounter(name: string): number {
    const fullName = this.getFullName(name);
    const values = this.metrics.get(fullName);
    if (!values) return 0;
    return values.reduce((sum, v) => sum + v.value, 0);
  }

  /**
   * Get latest value for a gauge metric.
   */
  getGauge(name: string): number | undefined {
    const fullName = this.getFullName(name);
    const values = this.metrics.get(fullName);
    if (!values || values.length === 0) return undefined;
    return values[values.length - 1]?.value;
  }

  /**
   * Get all values for a histogram metric.
   */
  getHistogramValues(name: string): number[] {
    const fullName = this.getFullName(name);
    const values = this.metrics.get(fullName);
    if (!values) return [];
    return values.map((v) => v.value);
  }
}

/**
 * Create a metrics collector.
 */
export function createMetricsCollector(
  enabled: boolean = true,
  prefix: string = 'milvus'
): MetricsCollector {
  if (enabled) {
    return new InMemoryMetricsCollector(prefix);
  }
  return new NoopMetricsCollector();
}
