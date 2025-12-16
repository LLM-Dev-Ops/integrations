/**
 * Prometheus Metrics Endpoint Integration
 *
 * Main entry point for the Prometheus metrics integration module.
 * Provides a complete solution for exposing application metrics via
 * Prometheus-compatible HTTP endpoints.
 */

// Re-export types
export * from './types';

// Re-export registry components
export { MetricsRegistry } from './registry';
export type { RegistryConfig } from './registry';
export { CardinalityTracker } from './registry/cardinality';
export { MetricFamilyImpl } from './registry/family';

// Re-export serialization components
export {
  PrometheusTextSerializer,
  OpenMetricsSerializer,
  createSerializer,
} from './serialization';
export type { OutputFormat } from './serialization';
