/**
 * Azure Key Vault Observability - Metrics
 *
 * Metrics collection for Key Vault operations following SPARC specification.
 */

/**
 * Metric types
 */
export enum MetricType {
  Counter = 'counter',
  Gauge = 'gauge',
  Histogram = 'histogram',
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  /**
   * Record a metric
   */
  record(metric: MetricDataPoint): void;

  /**
   * Increment a counter
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Default no-op metrics collector
 */
export class NoOpMetricsCollector implements MetricsCollector {
  record(_metric: MetricDataPoint): void {
    // No-op
  }

  increment(_name: string, _value?: number, _labels?: Record<string, string>): void {
    // No-op
  }

  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  histogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }
}

/**
 * Simple in-memory metrics collector
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private metrics: MetricDataPoint[] = [];

  record(metric: MetricDataPoint): void {
    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp ?? new Date(),
    });
  }

  increment(name: string, value = 1, labels?: Record<string, string>): void {
    this.record({
      name,
      type: MetricType.Counter,
      value,
      labels,
    });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record({
      name,
      type: MetricType.Gauge,
      value,
      labels,
    });
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record({
      name,
      type: MetricType.Histogram,
      value,
      labels,
    });
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): MetricDataPoint[] {
    return [...this.metrics];
  }

  /**
   * Clear all recorded metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): MetricDataPoint[] {
    return this.metrics.filter((m) => m.name === name);
  }
}

/**
 * Metric names used by Key Vault service
 */
export const METRICS = {
  // Cache metrics
  CACHE_HITS: 'keyvault_cache_hits',
  CACHE_MISSES: 'keyvault_cache_misses',
  CACHE_SIZE: 'keyvault_cache_size',

  // Operation metrics
  OPERATION_DURATION_MS: 'keyvault_operation_duration_ms',
  OPERATION_ERRORS: 'keyvault_operation_errors',
  OPERATION_SUCCESS: 'keyvault_operation_success',

  // Request metrics
  REQUEST_SIZE_BYTES: 'keyvault_request_size_bytes',
  RESPONSE_SIZE_BYTES: 'keyvault_response_size_bytes',

  // Rate limit metrics
  RATE_LIMIT_HITS: 'keyvault_rate_limit_hits',
  RETRY_ATTEMPTS: 'keyvault_retry_attempts',
} as const;

/**
 * Create metrics labels for an operation
 */
export function createOperationLabels(
  operation: string,
  vault?: string,
  resourceType?: string
): Record<string, string> {
  const labels: Record<string, string> = {
    operation,
  };

  if (vault) {
    labels.vault = vault;
  }

  if (resourceType) {
    labels.resource_type = resourceType;
  }

  return labels;
}

/**
 * Create metrics labels for cache operations
 */
export function createCacheLabels(
  resourceType: string,
  hit: boolean
): Record<string, string> {
  return {
    resource_type: resourceType,
    cache_result: hit ? 'hit' : 'miss',
  };
}
