/**
 * Prometheus Metrics - Common Traits and Interfaces
 *
 * Defines common interfaces for metric types and collectors.
 * Following London-School TDD principles for testability.
 */

import {
  MetricType,
  MetricFamily,
  MetricValue,
  HistogramValue,
  Labels,
} from '../types';

/**
 * Common interface for all metric types.
 * Provides core functionality for metric collection and serialization.
 */
export interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;

  /**
   * Collect current metric values for serialization.
   * Returns metric data in Prometheus exposition format.
   */
  collect(): MetricValue | MetricValue[] | HistogramValue | HistogramValue[];
}

/**
 * Interface for metric collectors (custom metrics).
 * Allows registration of custom metric collection logic.
 */
export interface Collector {
  /**
   * Describe the metrics this collector will produce.
   * Used for validation and documentation.
   */
  describe(): CollectorDescription;

  /**
   * Collect all metrics from this collector.
   * Called during scrape to gather current metric values.
   */
  collect(): MetricFamily[];
}

/**
 * Metadata describing a collector's metrics.
 */
export interface CollectorDescription {
  /** Unique name for this collector */
  name: string;

  /** Human-readable description */
  help: string;

  /** Type of metrics produced */
  type: MetricType;

  /** Label names used by this collector */
  labelNames?: string[];
}

/**
 * Interface for label validation and cardinality tracking.
 */
export interface LabelValidator {
  /**
   * Validate label names and values.
   * @throws InvalidLabelNameError if label name is invalid
   */
  validateLabels(labels: Labels): void;

  /**
   * Check if adding a new label combination would exceed cardinality limit.
   * @returns true if allowed, false if limit would be exceeded
   */
  checkCardinality(metricName: string, labels: Labels): boolean;
}

/**
 * Helper function to create a label key for storage.
 * Sorts labels alphabetically for consistent keys.
 */
export function createLabelKey(labels: Labels): string {
  const sortedKeys = Object.keys(labels).sort();
  return sortedKeys.map((key) => `${key}="${labels[key]}"`).join(',');
}

/**
 * Helper function to validate label count matches expected.
 */
export function validateLabelCount(
  metricName: string,
  expectedNames: string[],
  providedValues: string[]
): void {
  if (expectedNames.length !== providedValues.length) {
    throw new Error(
      `Label count mismatch for metric "${metricName}": ` +
        `expected ${expectedNames.length} (${expectedNames.join(', ')}), ` +
        `got ${providedValues.length}`
    );
  }
}

/**
 * Helper function to build labels object from names and values.
 */
export function buildLabelsObject(
  labelNames: string[],
  labelValues: string[]
): Labels {
  const labels: Labels = {};
  for (let i = 0; i < labelNames.length; i++) {
    labels[labelNames[i]] = labelValues[i];
  }
  return labels;
}
