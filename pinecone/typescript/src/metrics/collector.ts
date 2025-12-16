/**
 * Metrics collection for Pinecone integration monitoring and observability
 */

/**
 * Timer interface for measuring operation duration
 */
export interface Timer {
  /**
   * Observes the duration since timer creation
   * @returns Duration in milliseconds
   */
  observeDuration(): number;
}

/**
 * Histogram data with percentile calculations
 */
export interface HistogramData {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Snapshot of all collected metrics
 */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, HistogramData>;
  gauges: Record<string, number>;
}

/**
 * MetricsCollector interface for tracking Pinecone operations
 */
export interface MetricsCollector {
  /**
   * Start a timer for measuring operation duration
   * @param name - Name of the timer metric
   * @returns Timer instance
   */
  startTimer(name: string): Timer;

  /**
   * Increment a counter metric
   * @param name - Name of the counter
   * @param value - Value to increment by (default: 1)
   */
  increment(name: string, value?: number): void;

  /**
   * Record a histogram value
   * @param name - Name of the histogram
   * @param value - Value to record
   */
  histogram(name: string, value: number): void;

  /**
   * Set a gauge value
   * @param name - Name of the gauge
   * @param value - Value to set
   */
  gauge(name: string, value: number): void;

  /**
   * Get a snapshot of all metrics
   * @returns Current metrics snapshot
   */
  getMetrics(): MetricsSnapshot;
}

/**
 * Standard metric names for Pinecone integration
 */
export const MetricNames = {
  QUERIES_TOTAL: 'pinecone_queries_total',
  UPSERTS_TOTAL: 'pinecone_upserts_total',
  VECTORS_UPSERTED: 'pinecone_vectors_upserted_total',
  FETCHES_TOTAL: 'pinecone_fetches_total',
  DELETES_TOTAL: 'pinecone_deletes_total',
  ERRORS_TOTAL: 'pinecone_errors_total',
  RETRIES_TOTAL: 'pinecone_retries_total',
  QUERY_LATENCY: 'pinecone_query_latency_seconds',
  UPSERT_LATENCY: 'pinecone_upsert_latency_seconds',
  BATCH_SIZE: 'pinecone_batch_size',
  RESULT_COUNT: 'pinecone_result_count',
  POOL_SIZE: 'pinecone_pool_size',
  POOL_AVAILABLE: 'pinecone_pool_available',
} as const;

/**
 * In-memory timer implementation
 */
class InMemoryTimer implements Timer {
  private startTime: number;
  private metricName: string;
  private collector: InMemoryMetricsCollector;

  constructor(name: string, collector: InMemoryMetricsCollector) {
    this.startTime = Date.now();
    this.metricName = name;
    this.collector = collector;
  }

  observeDuration(): number {
    const duration = Date.now() - this.startTime;
    this.collector.histogram(this.metricName, duration);
    return duration;
  }
}

/**
 * In-memory metrics collector for development and testing
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private counters: Map<string, number>;
  private histograms: Map<string, number[]>;
  private gauges: Map<string, number>;

  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
  }

  startTimer(name: string): Timer {
    return new InMemoryTimer(name, this);
  }

  increment(name: string, value: number = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  histogram(name: string, value: number): void {
    const values = this.histograms.get(name) ?? [];
    values.push(value);
    this.histograms.set(name, values);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getMetrics(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    const histograms: Record<string, HistogramData> = {};
    const gauges: Record<string, number> = {};

    // Convert counters
    this.counters.forEach((value, key) => {
      counters[key] = value;
    });

    // Convert histograms with calculated statistics
    this.histograms.forEach((values, key) => {
      histograms[key] = this.calculateHistogramData(values);
    });

    // Convert gauges
    this.gauges.forEach((value, key) => {
      gauges[key] = value;
    });

    return { counters, histograms, gauges };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  /**
   * Calculate histogram statistics from raw values
   * @param values - Array of histogram values
   * @returns Calculated histogram data
   */
  private calculateHistogramData(values: number[]): HistogramData {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;

    return {
      count: values.length,
      sum,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      p50: this.calculatePercentile(sorted, 0.5),
      p95: this.calculatePercentile(sorted, 0.95),
      p99: this.calculatePercentile(sorted, 0.99),
    };
  }

  /**
   * Calculate a percentile value from sorted data
   * @param sorted - Sorted array of values
   * @param percentile - Percentile to calculate (0-1)
   * @returns Percentile value
   */
  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) {
      return 0;
    }

    const index = percentile * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) {
      return sorted[lower] ?? 0;
    }

    return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
  }
}

/**
 * No-op timer implementation
 */
class NoopTimer implements Timer {
  observeDuration(): number {
    return 0;
  }
}

/**
 * No-op metrics collector for production environments where metrics are disabled
 */
export class NoopMetricsCollector implements MetricsCollector {
  private static readonly NOOP_TIMER = new NoopTimer();

  startTimer(_name: string): Timer {
    return NoopMetricsCollector.NOOP_TIMER;
  }

  increment(_name: string, _value?: number): void {
    // No-op
  }

  histogram(_name: string, _value: number): void {
    // No-op
  }

  gauge(_name: string, _value: number): void {
    // No-op
  }

  getMetrics(): MetricsSnapshot {
    return {
      counters: {},
      histograms: {},
      gauges: {},
    };
  }
}
