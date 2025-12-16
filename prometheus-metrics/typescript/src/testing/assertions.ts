/**
 * Test assertion helpers for Prometheus metrics.
 */

import type { MockRegistry, RecordedMetric } from './mock-registry.js';
import type { Labels } from '../types.js';

/**
 * Assert that a counter has a specific value.
 */
export function assertCounterValue(
  registry: MockRegistry,
  name: string,
  expected: number,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  const total = filtered
    .filter((m) => m.type === 'counter' && m.operation === 'inc')
    .reduce((sum, m) => sum + m.value, 0);

  if (Math.abs(total - expected) > 0.0001) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(
      `Counter ${name}${labelStr} expected ${expected} but was ${total}`
    );
  }
}

/**
 * Assert that a gauge has a specific value.
 */
export function assertGaugeValue(
  registry: MockRegistry,
  name: string,
  expected: number,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  // For gauges, get the last set value
  const setOps = filtered.filter(
    (m) => m.type === 'gauge' && m.operation === 'set'
  );

  if (setOps.length === 0) {
    throw new Error(`No gauge values recorded for ${name}`);
  }

  const lastValue = setOps[setOps.length - 1]!.value;

  if (Math.abs(lastValue - expected) > 0.0001) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(
      `Gauge ${name}${labelStr} expected ${expected} but was ${lastValue}`
    );
  }
}

/**
 * Assert that a histogram has a specific number of observations.
 */
export function assertHistogramObservations(
  registry: MockRegistry,
  name: string,
  expectedCount: number,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  const observations = filtered.filter(
    (m) => m.type === 'histogram' && m.operation === 'observe'
  );

  if (observations.length !== expectedCount) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(
      `Histogram ${name}${labelStr} expected ${expectedCount} observations but had ${observations.length}`
    );
  }
}

/**
 * Assert that a histogram sum is within expected range.
 */
export function assertHistogramSum(
  registry: MockRegistry,
  name: string,
  expected: number,
  tolerance: number = 0.0001,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  const sum = filtered
    .filter((m) => m.type === 'histogram' && m.operation === 'observe')
    .reduce((total, m) => total + m.value, 0);

  if (Math.abs(sum - expected) > tolerance) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(
      `Histogram ${name}${labelStr} sum expected ${expected} (±${tolerance}) but was ${sum}`
    );
  }
}

/**
 * Assert that a metric was recorded.
 */
export function assertMetricRecorded(
  registry: MockRegistry,
  name: string,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  if (filtered.length === 0) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(`No metrics recorded for ${name}${labelStr}`);
  }
}

/**
 * Assert that a metric was NOT recorded.
 */
export function assertMetricNotRecorded(
  registry: MockRegistry,
  name: string,
  labels?: Labels
): void {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  if (filtered.length > 0) {
    const labelStr = labels ? ` with labels ${JSON.stringify(labels)}` : '';
    throw new Error(
      `Expected no metrics for ${name}${labelStr} but found ${filtered.length}`
    );
  }
}

/**
 * Assert cardinality of a metric is within limits.
 */
export function assertCardinalityWithinLimit(
  registry: MockRegistry,
  name: string,
  limit: number
): void {
  const metrics = registry.getMetricsByName(name);
  const uniqueLabelSets = new Set<string>();

  for (const metric of metrics) {
    const key = Object.entries(metric.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    uniqueLabelSets.add(key);
  }

  if (uniqueLabelSets.size > limit) {
    throw new Error(
      `Metric ${name} cardinality ${uniqueLabelSets.size} exceeds limit ${limit}`
    );
  }
}

/**
 * Get total counter increments for a metric.
 */
export function getTotalCounterIncrements(
  registry: MockRegistry,
  name: string,
  labels?: Labels
): number {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  return filtered
    .filter((m) => m.type === 'counter' && m.operation === 'inc')
    .reduce((sum, m) => sum + m.value, 0);
}

/**
 * Get all histogram observations for a metric.
 */
export function getHistogramObservations(
  registry: MockRegistry,
  name: string,
  labels?: Labels
): number[] {
  const metrics = registry.getMetricsByName(name);
  const filtered = labels
    ? metrics.filter((m) => labelsMatch(m.labels, labels))
    : metrics;

  return filtered
    .filter((m) => m.type === 'histogram' && m.operation === 'observe')
    .map((m) => m.value);
}

/**
 * Check if two label sets match.
 */
function labelsMatch(actual: Labels, expected: Labels): boolean {
  const expectedKeys = Object.keys(expected);
  for (const key of expectedKeys) {
    if (actual[key] !== expected[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Create a test registry factory.
 */
export function createTestRegistry(namespace = 'test'): MockRegistry {
  return new MockRegistry(namespace);
}
