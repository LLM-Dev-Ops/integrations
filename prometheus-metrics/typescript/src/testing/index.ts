/**
 * Testing utilities for Prometheus metrics.
 * Provides mock implementations and assertion helpers.
 */

export {
  MockRegistry,
  MockCounter,
  MockCounterVec,
  MockGauge,
  MockGaugeVec,
  MockHistogram,
  MockHistogramVec,
  type RecordedMetric,
} from './mock-registry.js';

export {
  assertCounterValue,
  assertGaugeValue,
  assertHistogramObservations,
  assertHistogramSum,
  assertMetricRecorded,
  assertMetricNotRecorded,
  assertCardinalityWithinLimit,
  getTotalCounterIncrements,
  getHistogramObservations,
  createTestRegistry,
} from './assertions.js';
