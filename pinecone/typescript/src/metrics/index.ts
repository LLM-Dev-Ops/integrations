/**
 * Metrics collection module for Pinecone integration
 */

import {
  MetricsCollector,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
} from './collector.js';

export type {
  MetricsCollector,
  Timer,
  MetricsSnapshot,
  HistogramData,
} from './collector.js';

export {
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
} from './collector.js';

/**
 * Factory function to create a metrics collector
 * @param enabled - Whether to enable metrics collection (default: true)
 * @returns MetricsCollector instance
 */
export function createMetricsCollector(enabled: boolean = true): MetricsCollector {
  return enabled ? new InMemoryMetricsCollector() : new NoopMetricsCollector();
}
