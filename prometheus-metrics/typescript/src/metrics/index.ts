/**
 * Prometheus Metrics Module - Barrel Exports
 *
 * Exports all metric implementations and interfaces.
 * Provides a single entry point for metric types.
 */

// Traits and interfaces
export {
  Metric,
  Collector,
  CollectorDescription,
  LabelValidator,
  createLabelKey,
  validateLabelCount,
  buildLabelsObject,
} from './traits';

// Counter
export { Counter, CounterVec } from './counter';

// Gauge
export { Gauge, GaugeVec } from './gauge';

// Histogram
export { Histogram, HistogramVec } from './histogram';

// Re-export types for convenience
export type {
  Labels,
  MetricType,
  MetricValue,
  HistogramValue,
  MetricFamily,
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
} from '../types';

export {
  DEFAULT_LATENCY_BUCKETS,
  CardinalityExceededError,
  InvalidMetricNameError,
  InvalidLabelNameError,
  isValidMetricName,
  isValidLabelName,
  formatMetricName,
} from '../types';
