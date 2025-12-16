/**
 * OpenTelemetry Integration Types
 *
 * Re-exports all types from the common module for convenient access.
 *
 * @module types
 */

// Configuration types
export type {
  TelemetryConfig,
  OpenTelemetryConfig,
  TracerConfig,
  MeterConfig,
  ExporterConfig,
  ExportProtocol,
  CompressionAlgorithm,
  TlsConfig,
  SamplingConfig,
  SamplerConfig,
  SamplingStrategy,
  RedactionConfig,
  BatchConfig,
  ResourceAttributes,
  OtlpProtocol,
} from './common.js';

// Attribute types
export type {
  AttributeValue,
  SpanAttributes,
  MetricAttributes,
  KeyValue,
} from './common.js';

// Span types
export type {
  SpanContext,
  Link,
  Event,
  Span,
  SpanOptions,
  SpanEndOptions,
  SpanStatus,
} from './common.js';

// Context and Tracer types
export type {
  Context,
  Tracer,
} from './common.js';

// Metric types
export type {
  MetricInstrumentConfig,
  MetricDataPoint,
  MetricOptions,
  Counter,
  Histogram,
  UpDownCounter,
  ObservableGauge,
  Meter,
} from './common.js';

// Log types
export type {
  LogRecord,
} from './common.js';

// Semantic convention types
export type {
  LLMAttributes,
  AgentAttributes,
  SemanticAttributes,
} from './common.js';

// Error classes (exported as both types and values)
export {
  OtelError,
  ConfigurationError,
  ExportError,
  PropagationError,
  InstrumentationError,
  ShutdownError,
} from './common.js';

// Utility types
export type {
  ContextCarrier,
  ExportResult,
  HealthStatus,
} from './common.js';

// Enums
export {
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  MetricInstrumentType,
  LogSeverity,
  OtelErrorKind,
} from './common.js';


// Type guards
export {
  isOtelError,
  isConfigurationError,
  isExportError,
  isPropagationError,
  isInstrumentationError,
  isShutdownError,
} from './common.js';
