/**
 * Metrics module exports
 */

// MetricsClient interface
export { MetricsClient } from './interface.js';

// DogStatsD client
export { DogStatsD } from './statsd.js';
export type { DogStatsDConfig } from './statsd.js';

// Timer utility
export { Timer, createTimer } from './timer.js';

// Cardinality protection
export { CardinalityProtector } from './cardinality.js';
export type { CardinalityProtectorConfig } from './cardinality.js';

// Metric coalescing
export { CoalescingMetricBuffer } from './coalescing.js';
export type { CoalescingBufferConfig, FlushedMetric } from './coalescing.js';
