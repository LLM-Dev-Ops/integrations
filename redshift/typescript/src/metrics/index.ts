/**
 * Redshift Integration Metrics
 *
 * Prometheus-compatible metrics collection for the Redshift integration.
 * @module @llmdevops/redshift-integration/metrics
 */

// ============================================================================
// Types and Interfaces
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
 * Configuration for the metrics collector.
 */
export interface MetricsConfig {
  /** Metric name prefix */
  prefix?: string;
  /** Whether metrics collection is enabled */
  enabled?: boolean;
  /** Global labels to apply to all metrics */
  labels?: Record<string, string>;
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

/**
 * Query statistics for recording.
 */
export interface QueryStatistics {
  /** Query duration in milliseconds */
  duration: number;
  /** Number of rows returned */
  rows?: number;
  /** Bytes scanned */
  bytes?: number;
  /** Query type */
  queryType?: string;
  /** Success status */
  success: boolean;
  /** Error code if failed */
  errorCode?: string;
}

/**
 * Snapshot of all metrics at a point in time.
 */
export interface MetricsSnapshot {
  /** Counter metrics */
  counters: Record<string, Array<{ value: number; labels: Labels }>>;
  /** Gauge metrics */
  gauges: Record<string, Array<{ value: number; labels: Labels }>>;
  /** Histogram metrics */
  histograms: Record<
    string,
    Array<{ sum: number; count: number; buckets: Record<number, number>; labels: Labels }>
  >;
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
 * Metrics collector for Redshift integration.
 *
 * Collects and exports Prometheus-compatible metrics for monitoring
 * Redshift operations including queries, connections, pool usage,
 * COPY/UNLOAD operations, and errors.
 *
 * @example
 * ```typescript
 * const collector = new MetricsCollector({
 *   prefix: 'redshift',
 *   enabled: true,
 *   labels: { environment: 'production' }
 * });
 *
 * // Record a query
 * collector.recordQuery({
 *   duration: 1500,
 *   rows: 1000,
 *   bytes: 1024000,
 *   queryType: 'select',
 *   success: true
 * });
 *
 * // Export to Prometheus
 * const metrics = collector.toPrometheus();
 * ```
 */
export class MetricsCollector {
  private readonly prefix: string;
  private readonly globalLabels: Labels;
  private readonly counters = new Map<string, CounterValue[]>();
  private readonly gauges = new Map<string, GaugeValue[]>();
  private readonly histograms = new Map<string, HistogramValue[]>();
  private readonly definitions = new Map<string, MetricDefinition>();
  private enabled: boolean;

  /**
   * Creates a new metrics collector.
   *
   * @param config - Metrics configuration
   */
  constructor(config: MetricsConfig = {}) {
    this.prefix = config.prefix ?? 'redshift';
    this.enabled = config.enabled ?? true;
    this.globalLabels = config.labels ?? {};
  }

  /**
   * Enables or disables metrics collection.
   *
   * @param enabled - Whether to enable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Checks if metrics collection is enabled.
   *
   * @returns True if metrics collection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Registers a metric definition.
   *
   * @param definition - Metric definition to register
   */
  register(definition: MetricDefinition): void {
    const fullName = `${this.prefix}_${definition.name}`;
    this.definitions.set(fullName, { ...definition, name: fullName });
  }

  /**
   * Increments a counter metric.
   *
   * @param name - Metric name (without prefix)
   * @param labels - Metric labels
   * @param value - Value to increment by (default: 1)
   *
   * @example
   * ```typescript
   * collector.incrementCounter('queries_total', { status: 'success', query_type: 'select' });
   * collector.incrementCounter('errors_total', { error_code: 'TIMEOUT' }, 1);
   * ```
   */
  incrementCounter(name: string, labels: Labels = {}, value: number = 1): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const mergedLabels = { ...this.globalLabels, ...labels };
    const values = this.counters.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, mergedLabels));

    if (existing) {
      existing.value += value;
    } else {
      values.push({ value, labels: mergedLabels });
      this.counters.set(fullName, values);
    }
  }

  /**
   * Sets a gauge metric to a specific value.
   *
   * @param name - Metric name (without prefix)
   * @param value - Value to set
   * @param labels - Metric labels
   *
   * @example
   * ```typescript
   * collector.setGauge('pool_connections_active', 5);
   * collector.setGauge('pool_connections_idle', 3);
   * ```
   */
  setGauge(name: string, value: number, labels: Labels = {}): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const mergedLabels = { ...this.globalLabels, ...labels };
    const values = this.gauges.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, mergedLabels));

    if (existing) {
      existing.value = value;
    } else {
      values.push({ value, labels: mergedLabels });
      this.gauges.set(fullName, values);
    }
  }

  /**
   * Increments a gauge metric.
   *
   * @param name - Metric name (without prefix)
   * @param labels - Metric labels
   * @param value - Value to increment by (default: 1)
   */
  incrementGauge(name: string, labels: Labels = {}, value: number = 1): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const mergedLabels = { ...this.globalLabels, ...labels };
    const values = this.gauges.get(fullName) ?? [];
    const existing = values.find((v) => this.labelsMatch(v.labels, mergedLabels));

    if (existing) {
      existing.value += value;
    } else {
      values.push({ value, labels: mergedLabels });
      this.gauges.set(fullName, values);
    }
  }

  /**
   * Decrements a gauge metric.
   *
   * @param name - Metric name (without prefix)
   * @param labels - Metric labels
   * @param value - Value to decrement by (default: 1)
   */
  decrementGauge(name: string, labels: Labels = {}, value: number = 1): void {
    this.incrementGauge(name, labels, -value);
  }

  /**
   * Records a value in a histogram metric.
   *
   * @param name - Metric name (without prefix)
   * @param value - Value to record
   * @param labels - Metric labels
   * @param bucketBoundaries - Histogram bucket boundaries
   *
   * @example
   * ```typescript
   * collector.recordHistogram('query_duration_ms', 1500, { query_type: 'select' });
   * collector.recordHistogram('rows_returned', 1000, { query_type: 'select' });
   * ```
   */
  recordHistogram(
    name: string,
    value: number,
    labels: Labels = {},
    bucketBoundaries: number[] = [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ]
  ): void {
    if (!this.enabled) return;

    const fullName = `${this.prefix}_${name}`;
    const mergedLabels = { ...this.globalLabels, ...labels };
    const values = this.histograms.get(fullName) ?? [];
    let existing = values.find((v) => this.labelsMatch(v.labels, mergedLabels));

    if (!existing) {
      existing = {
        sum: 0,
        count: 0,
        buckets: new Map(bucketBoundaries.map((b) => [b, 0])),
        labels: mergedLabels,
      };
      values.push(existing);
      this.histograms.set(fullName, values);
    }

    existing.sum += value;
    existing.count += 1;

    for (const [boundary] of Array.from(existing.buckets)) {
      if (value <= boundary) {
        existing.buckets.set(boundary, (existing.buckets.get(boundary) ?? 0) + 1);
      }
    }
  }

  /**
   * Records query statistics.
   *
   * This is a convenience method that records multiple metrics in one call:
   * - Increments queries_total counter
   * - Records query_duration_ms histogram
   * - Records rows_returned histogram (if provided)
   * - Records bytes_scanned histogram (if provided)
   *
   * @param stats - Query statistics
   * @param labels - Additional labels to apply
   *
   * @example
   * ```typescript
   * collector.recordQuery({
   *   duration: 1500,
   *   rows: 1000,
   *   bytes: 1024000,
   *   queryType: 'select',
   *   success: true
   * });
   * ```
   */
  recordQuery(stats: QueryStatistics, labels: Labels = {}): void {
    if (!this.enabled) return;

    const queryLabels = {
      ...labels,
      status: stats.success ? 'success' : 'failed',
      ...(stats.queryType && { query_type: stats.queryType }),
    };

    // Increment query counter
    this.incrementCounter('queries_total', queryLabels);

    // Record duration
    this.recordHistogram(
      'query_duration_ms',
      stats.duration,
      stats.queryType ? { query_type: stats.queryType } : {},
      [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000]
    );

    // Record rows if provided
    if (stats.rows !== undefined) {
      this.recordHistogram(
        'rows_returned',
        stats.rows,
        stats.queryType ? { query_type: stats.queryType } : {},
        [1, 10, 100, 1000, 10000, 100000, 1000000]
      );
    }

    // Record bytes if provided
    if (stats.bytes !== undefined) {
      this.recordHistogram(
        'bytes_scanned',
        stats.bytes,
        {},
        [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10]
      );
    }

    // Record error if failed
    if (!stats.success && stats.errorCode) {
      this.incrementCounter('errors_total', { error_code: stats.errorCode });
    }
  }

  /**
   * Records a duration using a histogram.
   *
   * @param name - Metric name (without prefix)
   * @param startTime - Start time in milliseconds (from Date.now())
   * @param labels - Metric labels
   */
  recordDuration(name: string, startTime: number, labels: Labels = {}): void {
    const durationMs = Date.now() - startTime;
    this.recordHistogram(name, durationMs, labels);
  }

  /**
   * Creates a timer that records duration when stopped.
   *
   * @param name - Metric name (without prefix)
   * @param labels - Metric labels
   * @returns Function to stop the timer and record the duration
   *
   * @example
   * ```typescript
   * const stopTimer = collector.startTimer('query_duration_ms', { query_type: 'select' });
   * // ... perform operation ...
   * stopTimer(); // Records the duration
   * ```
   */
  startTimer(name: string, labels: Labels = {}): () => void {
    const startTime = Date.now();
    return () => this.recordDuration(name, startTime, labels);
  }

  /**
   * Gets a snapshot of all current metric values.
   *
   * @returns Snapshot of all metrics
   *
   * @example
   * ```typescript
   * const snapshot = collector.getSnapshot();
   * console.log(snapshot.counters['redshift_queries_total']);
   * ```
   */
  getSnapshot(): MetricsSnapshot {
    const snapshot: MetricsSnapshot = {
      counters: {},
      gauges: {},
      histograms: {},
    };

    // Counters
    for (const [name, values] of Array.from(this.counters)) {
      snapshot.counters[name] = values.map((v) => ({ value: v.value, labels: { ...v.labels } }));
    }

    // Gauges
    for (const [name, values] of Array.from(this.gauges)) {
      snapshot.gauges[name] = values.map((v) => ({ value: v.value, labels: { ...v.labels } }));
    }

    // Histograms
    for (const [name, values] of Array.from(this.histograms)) {
      snapshot.histograms[name] = values.map((v) => ({
        sum: v.sum,
        count: v.count,
        buckets: Object.fromEntries(Array.from(v.buckets)),
        labels: { ...v.labels },
      }));
    }

    return snapshot;
  }

  /**
   * Exports all metrics in Prometheus text format.
   *
   * @returns Metrics in Prometheus exposition format
   *
   * @example
   * ```typescript
   * const prometheus = collector.toPrometheus();
   * console.log(prometheus);
   * // # HELP redshift_queries_total Total number of queries executed
   * // # TYPE redshift_queries_total counter
   * // redshift_queries_total{status="success",query_type="select"} 42
   * ```
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, values] of Array.from(this.counters)) {
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
    for (const [name, values] of Array.from(this.gauges)) {
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
    for (const [name, values] of Array.from(this.histograms)) {
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
   * Exports all metrics as a JSON object.
   *
   * @returns Metrics in JSON format for logging
   *
   * @example
   * ```typescript
   * const json = collector.toJson();
   * console.log(JSON.stringify(json, null, 2));
   * ```
   */
  toJson(): object {
    const result: Record<string, any> = {};

    // Counters
    for (const [name, values] of Array.from(this.counters)) {
      result[name] = values.map((v) => ({ value: v.value, labels: v.labels }));
    }

    // Gauges
    for (const [name, values] of Array.from(this.gauges)) {
      result[name] = values.map((v) => ({ value: v.value, labels: v.labels }));
    }

    // Histograms
    for (const [name, values] of Array.from(this.histograms)) {
      result[name] = values.map((v) => ({
        sum: v.sum,
        count: v.count,
        mean: v.count > 0 ? v.sum / v.count : 0,
        buckets: Object.fromEntries(Array.from(v.buckets)),
        labels: v.labels,
      }));
    }

    return result;
  }

  /**
   * Gets a specific metric value.
   *
   * @param name - Metric name (without prefix)
   * @param labels - Metric labels
   * @returns The metric value, or undefined if not found
   */
  getMetricValue(name: string, labels: Labels = {}): number | undefined {
    const fullName = `${this.prefix}_${name}`;
    const mergedLabels = { ...this.globalLabels, ...labels };

    const counter = this.counters.get(fullName)?.find((v) => this.labelsMatch(v.labels, mergedLabels));
    if (counter) return counter.value;

    const gauge = this.gauges.get(fullName)?.find((v) => this.labelsMatch(v.labels, mergedLabels));
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
 * Default metrics for Redshift integration.
 */
export const DEFAULT_METRICS: MetricDefinition[] = [
  // Query metrics
  {
    name: 'queries_total',
    type: 'counter',
    help: 'Total number of queries executed',
    labelNames: ['status', 'query_type'],
  },
  {
    name: 'query_duration_ms',
    type: 'histogram',
    help: 'Query execution duration in milliseconds',
    labelNames: ['query_type'],
    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000],
  },
  {
    name: 'rows_returned',
    type: 'histogram',
    help: 'Rows returned per query',
    labelNames: ['query_type'],
    buckets: [1, 10, 100, 1000, 10000, 100000, 1000000],
  },
  {
    name: 'bytes_scanned',
    type: 'histogram',
    help: 'Bytes scanned per query',
    buckets: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10],
  },
  {
    name: 'active_queries',
    type: 'gauge',
    help: 'Number of currently active queries',
  },

  // Connection metrics
  {
    name: 'connections_total',
    type: 'counter',
    help: 'Total number of connections created',
    labelNames: ['status'],
  },

  // Pool metrics
  {
    name: 'pool_connections_active',
    type: 'gauge',
    help: 'Number of active connections in pool',
  },
  {
    name: 'pool_connections_idle',
    type: 'gauge',
    help: 'Number of idle connections in pool',
  },
  {
    name: 'pool_connections_waiting',
    type: 'gauge',
    help: 'Number of clients waiting for a connection',
  },
  {
    name: 'pool_acquisitions_total',
    type: 'counter',
    help: 'Total number of pool connection acquisitions',
    labelNames: ['status'],
  },
  {
    name: 'pool_acquire_duration_ms',
    type: 'histogram',
    help: 'Time to acquire a connection from pool in milliseconds',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  },

  // COPY operation metrics
  {
    name: 'copy_operations_total',
    type: 'counter',
    help: 'Total number of COPY operations',
    labelNames: ['status'],
  },
  {
    name: 'copy_rows_total',
    type: 'counter',
    help: 'Total rows loaded via COPY',
    labelNames: ['table'],
  },
  {
    name: 'copy_bytes_total',
    type: 'counter',
    help: 'Total bytes loaded via COPY',
    labelNames: ['table'],
  },

  // UNLOAD operation metrics
  {
    name: 'unload_operations_total',
    type: 'counter',
    help: 'Total number of UNLOAD operations',
    labelNames: ['status'],
  },
  {
    name: 'unload_rows_total',
    type: 'counter',
    help: 'Total rows unloaded',
    labelNames: ['table'],
  },
  {
    name: 'unload_files_total',
    type: 'counter',
    help: 'Total files created by UNLOAD',
    labelNames: ['table'],
  },

  // Transaction metrics
  {
    name: 'transactions_total',
    type: 'counter',
    help: 'Total number of transactions',
    labelNames: ['status'],
  },

  // Error metrics
  {
    name: 'errors_total',
    type: 'counter',
    help: 'Total errors by error code',
    labelNames: ['error_code'],
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
 *
 * @param config - Metrics configuration (only used on first call)
 * @returns The global metrics collector instance
 *
 * @example
 * ```typescript
 * // Initialize with config
 * const metrics = getMetrics({ prefix: 'redshift', enabled: true });
 *
 * // Later calls reuse the same instance
 * const metrics2 = getMetrics(); // Returns same instance
 * ```
 */
export function getMetrics(config?: MetricsConfig): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector(config);
    // Register default metrics
    for (const def of DEFAULT_METRICS) {
      globalMetrics.register(def);
    }
  }
  return globalMetrics;
}

/**
 * Resets the global metrics collector.
 *
 * This will create a new instance on the next call to getMetrics().
 */
export function resetMetrics(): void {
  globalMetrics = undefined;
}
