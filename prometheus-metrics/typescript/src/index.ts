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

// Re-export metric implementations
export { Counter, CounterVec } from './metrics/counter';
export { Gauge, GaugeVec } from './metrics/gauge';
export { Histogram, HistogramVec } from './metrics/histogram';
export { createLabelKey, validateLabelCount, buildLabelsObject } from './metrics/traits';
export type { Metric, Collector, CollectorDescription, LabelValidator } from './metrics/traits';

// Re-export serialization components
export {
  PrometheusTextSerializer,
  OpenMetricsSerializer,
  createSerializer,
  escapeHelpText,
  escapeLabelValue,
  formatLabels,
  formatValue,
} from './serialization';
export type { OutputFormat } from './serialization';

// Re-export HTTP components
export {
  MetricsHandler,
  type MetricsRequest,
  type MetricsResponse,
  type HandlerConfig,
} from './http/handler';
export { handleHealth, handleReady, type HealthResponse } from './http/health';
export { ResponseCache, type CachedResponse } from './http/cache';
export { compressIfNeeded, acceptsGzip } from './http/compression';
export { createExpressMiddleware, createFastifyHandler } from './http/middleware';

// Re-export collectors
export {
  LlmMetricsCollector,
  type LlmRequestParams,
  LLM_LATENCY_BUCKETS,
} from './collectors/llm-collector';
export {
  AgentMetricsCollector,
  type AgentExecutionParams,
  AGENT_LATENCY_BUCKETS,
} from './collectors/agent-collector';
export {
  ProcessCollector,
  type ProcessCollectorConfig,
} from './collectors/process-collector';
export {
  RuntimeCollector,
  type RuntimeCollectorConfig,
  GC_DURATION_BUCKETS,
} from './collectors/runtime-collector';

// Re-export configuration
export { MetricsConfig, MetricsConfigBuilder, type MetricsConfigOptions } from './config';

// Re-export error types
export {
  MetricsError,
  ConfigurationError,
  ValidationError,
  RegistrationError,
  CardinalityError,
  CollectionError,
  SerializationError,
  TimeoutError,
  EndpointError,
  isRetryableError,
  isMetricsError,
  getErrorCategory,
  formatError,
  type ErrorCategory,
} from './errors';

// Re-export label utilities
export {
  isValidLabelName,
  isValidMetricName,
  isHighCardinalityValue,
  validateLabelSet,
  type ValidationResult,
} from './labels/validation';
export {
  sanitizeMetricName,
  sanitizeLabelValue,
  sanitizeLabelSet,
  buildMetricName,
  MAX_LABEL_VALUE_LENGTH,
} from './labels/sanitization';

// Re-export testing utilities
export {
  MockRegistry,
  MockCounter,
  MockCounterVec,
  MockGauge,
  MockGaugeVec,
  MockHistogram,
  MockHistogramVec,
  type RecordedMetric,
} from './testing/mock-registry';
