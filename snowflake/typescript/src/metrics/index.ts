/**
 * Snowflake Integration Metrics
 *
 * Prometheus-compatible metrics collection for the Snowflake integration.
 * @module @llmdevops/snowflake-integration/metrics
 */

// ============================================================================
// Metric Types
// ============================================================================

/**
 * Metric type.
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Metric labels.
 */
export type Labels = Record<string, string>;

/**
 * Histogram buckets configuration.
 */
export interface HistogramBuckets {
  /** Bucket boundaries */
  buckets: number[];
}

/**
 * Metric definition.
 */
export interface MetricDefinition {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Help text */
  help: string;
  /** Label names */
  labelNames?: string[];
  /** Histogram buckets (for histogram type) */
  buckets?: number[];
}

// ============================================================================
// Metric Value Types
// ============================================================================

/**
 * Counter metric value.
 */
interface CounterValue {
  value: number;
  labels: Labels;
}

/**
 * Gauge metric value.
 */
interface GaugeValue {
  value: number;
  labels: Labels;
}

/**
 * Histogram metric value.
 */
interface HistogramValue {
  sum: number;
  count: number;
  buckets: Map<number, number>;
  labels: Labels;
}

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * Metrics collector for Snowflake integration.
 */
export class MetricsCollector {
  private readonly prefix: string;
  private readonly counters = new Map<string, CounterValue[]>();
  private readonly gauges = new Map<string, GaugeValue[]>();
  private readonly histograms = new Map<string, HistogramValue[]>();
  private readonly definitions = new Map<string, MetricDefinition>();
  private enabled: boolean;

  constructor(options: { prefix?: string; enabled?: boolean } = {}) {
    this.prefix = options.prefix ?? 'snowflake';
    this.enabled = options.enabled ?? true;
  }

  /**
   * Enables or disables metrics collection.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Checks if metrics collection is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Registers a metric definition.
   */
  register(definition: MetricDefinition): void {
    const fullName = `${this.prefix}_${definition.name}`;
    this.definitions.set(fullName, { ...definition, name: fullName });
  }

  /**
   * Increments a counter.
   */
  incrementCounter(name: string, labels: Labels = {}, value: number = 1): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const values = this.counters.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, labels));

    if (existing) {
      existing.value += value;
    } else {
      values.push({ value, labels });
      this.counters.set(fullName, values);
    }
  }

  /**
   * Sets a gauge value.
   */
  setGauge(name: string, value: number, labels: Labels = {}): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const values = this.gauges.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, labels));

    if (existing) {
      existing.value = value;
    } else {
      values.push({ value, labels });
      this.gauges.set(fullName, values);
    }
  }

  /**
   * Increments a gauge value.
   */
  incrementGauge(name: string, labels: Labels = {}, value: number = 1): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const values = this.gauges.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, labels));

    if (existing) {
      existing.value += value;
    } else {
      values.push({ value, labels });
      this.gauges.set(fullName, values);
    }
  }

  /**
   * Decrements a gauge value.
   */
  decrementGauge(name: string, labels: Labels = {}, value: number = 1): void {
    this.incrementGauge(name, labels, -value);
  }

  /**
   * Observes a value in a histogram.
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Labels = {},
    bucketBoundaries: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const values = this.histograms.get(fullName) ?? [];
    let existing = values.find((v) => this.labelsMatch(v.labels, labels));

    if (!existing) {
      existing = {
        sum: 0,
        count: 0,
        buckets: new Map(bucketBoundaries.map((b) => [b, 0])),
        labels,
      };
      values.push(existing);
      this.histograms.set(fullName, values);
    }

    existing.sum += value;
    existing.count += 1;

    for (const [boundary] of existing.buckets) {
      if (value <= boundary) {
        existing.buckets.set(boundary, (existing.buckets.get(boundary) ?? 0) + 1);
      }
    }
  }

  /**
   * Records a duration using a histogram.
   */
  recordDuration(name: string, startTime: number, labels: Labels = {}): void {
    const durationSeconds = (Date.now() - startTime) / 1000;
    this.observeHistogram(name, durationSeconds, labels);
  }

  /**
   * Creates a timer that records duration when stopped.
   */
  startTimer(name: string, labels: Labels = {}): () => void {
    const startTime = Date.now();
    return () => this.recordDuration(name, startTime, labels);
  }

  /**
   * Gets all metrics in Prometheus text format.
   */
  getMetrics(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, values] of this.counters) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const { value, labels } of values) {
        lines.push(`${name}${this.formatLabels(labels)} ${value}`);
      }
    }

    // Gauges
    for (const [name, values] of this.gauges) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const { value, labels } of values) {
        lines.push(`${name}${this.formatLabels(labels)} ${value}`);
      }
    }

    // Histograms
    for (const [name, values] of this.histograms) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }
      for (const { sum, count, buckets, labels } of values) {
        const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
        let cumulative = 0;
        for (const [boundary, bucketCount] of sortedBuckets) {
          cumulative += bucketCount;
          lines.push(
            `${name}_bucket${this.formatLabels({ ...labels, le: String(boundary) })} ${cumulative}`
          );
        }
        lines.push(`${name}_bucket${this.formatLabels({ ...labels, le: '+Inf' })} ${count}`);
        lines.push(`${name}_sum${this.formatLabels(labels)} ${sum}`);
        lines.push(`${name}_count${this.formatLabels(labels)} ${count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Gets a specific metric value.
   */
  getMetricValue(name: string, labels: Labels = {}): number | undefined {
    const fullName = `${this.prefix}_${name}`;

    const counter = this.counters.get(fullName)?.find((v) => this.labelsMatch(v.labels, labels));
    if (counter) return counter.value;

    const gauge = this.gauges.get(fullName)?.find((v) => this.labelsMatch(v.labels, labels));
    if (gauge) return gauge.value;

    return undefined;
  }

  /**
   * Resets all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private labelsMatch(a: Labels, b: Labels): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => a[key] === b[key]);
  }

  private formatLabels(labels: Labels): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const formatted = entries.map(([k, v]) => `${k}="${v}"`).join(',');
    return `{${formatted}}`;
  }
}

// ============================================================================
// Default Metric Definitions
// ============================================================================

/**
 * Default metrics for Snowflake integration.
 */
export const DEFAULT_METRICS: MetricDefinition[] = [
  // Connection metrics
  {
    name: 'connections_total',
    type: 'counter',
    help: 'Total number of connections created',
    labelNames: ['status'],
  },
  {
    name: 'connections_active',
    type: 'gauge',
    help: 'Number of active connections',
  },
  {
    name: 'connections_idle',
    type: 'gauge',
    help: 'Number of idle connections in pool',
  },
  {
    name: 'connection_acquire_duration_seconds',
    type: 'histogram',
    help: 'Time to acquire a connection from pool',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  },

  // Query metrics
  {
    name: 'queries_total',
    type: 'counter',
    help: 'Total number of queries executed',
    labelNames: ['status', 'warehouse'],
  },
  {
    name: 'query_duration_seconds',
    type: 'histogram',
    help: 'Query execution duration in seconds',
    labelNames: ['warehouse'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  },
  {
    name: 'query_bytes_scanned',
    type: 'histogram',
    help: 'Bytes scanned per query',
    labelNames: ['warehouse'],
    buckets: [1e6, 1e7, 1e8, 1e9, 1e10, 1e11],
  },
  {
    name: 'query_rows_returned',
    type: 'histogram',
    help: 'Rows returned per query',
    labelNames: ['warehouse'],
    buckets: [1, 10, 100, 1000, 10000, 100000, 1000000],
  },

  // Credit metrics
  {
    name: 'credits_used_total',
    type: 'counter',
    help: 'Total credits consumed',
    labelNames: ['warehouse'],
  },

  // Ingestion metrics
  {
    name: 'rows_loaded_total',
    type: 'counter',
    help: 'Total rows loaded via COPY/INSERT',
    labelNames: ['table'],
  },
  {
    name: 'files_processed_total',
    type: 'counter',
    help: 'Total files processed',
    labelNames: ['status'],
  },

  // Error metrics
  {
    name: 'errors_total',
    type: 'counter',
    help: 'Total errors by type',
    labelNames: ['error_type'],
  },

  // Circuit breaker metrics
  {
    name: 'circuit_breaker_state',
    type: 'gauge',
    help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  },
  {
    name: 'circuit_breaker_trips_total',
    type: 'counter',
    help: 'Number of times circuit breaker has tripped',
  },
];

// ============================================================================
// Global Metrics Instance
// ============================================================================

/**
 * Global metrics collector instance.
 */
let globalMetrics: MetricsCollector | undefined;

/**
 * Gets or creates the global metrics collector.
 */
export function getMetrics(options?: { prefix?: string; enabled?: boolean }): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector(options);
    // Register default metrics
    for (const def of DEFAULT_METRICS) {
      globalMetrics.register(def);
    }
  }
  return globalMetrics;
}

/**
 * Resets the global metrics collector.
 */
export function resetMetrics(): void {
  globalMetrics = undefined;
}
