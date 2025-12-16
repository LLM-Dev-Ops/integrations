/**
 * Metric-related types for StatsD metrics collection.
 *
 * Defines metric types and captured metric structure for Datadog APM.
 */

import type { Tags } from './common';

/**
 * Metric type enumeration for different aggregation methods
 */
export enum MetricType {
  /** Counter - increments/decrements */
  COUNT = 'count',
  /** Gauge - point-in-time value */
  GAUGE = 'gauge',
  /** Histogram - statistical distribution */
  HISTOGRAM = 'histogram',
  /** Distribution - percentile aggregations */
  DISTRIBUTION = 'distribution',
  /** Set - count of unique values */
  SET = 'set',
}

/**
 * Captured metric structure for buffering before sending to StatsD
 */
export interface CapturedMetric {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Tags attached to the metric */
  tags?: Tags;
  /** Sample rate (0.0 to 1.0) */
  sampleRate?: number;
  /** Timestamp when the metric was captured */
  timestamp: number;
}
