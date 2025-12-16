/**
 * @integrations/opentelemetry
 *
 * OpenTelemetry integration for the LLM DevOps platform
 *
 * Provides comprehensive observability for LLM operations including:
 * - Distributed tracing with W3C TraceContext propagation
 * - Metrics collection with LLM-specific instruments
 * - Structured logging with trace correlation
 * - LLM semantic conventions for spans and metrics
 * - Agent workflow tracing
 * - Attribute redaction and security
 *
 * @example
 * ```typescript
 * import {
 *   TelemetryProvider,
 *   createLLMSpan,
 *   createAgentTracer,
 *   configFromEnv,
 * } from '@integrations/opentelemetry';
 *
 * // Create provider from environment
 * const provider = TelemetryProvider.fromEnv();
 *
 * // Get a tracer
 * const tracer = provider.tracer('my-llm-service');
 *
 * // Create LLM spans
 * const llmSpan = createLLMSpan(tracer, 'chat', 'gpt-4', 'openai')
 *   .withPrompt('Hello, world!')
 *   .withMaxTokens(1000)
 *   .start();
 *
 * // Record response
 * llmSpan.setResponse('Hello!', 'stop');
 * llmSpan.setTokenUsage(10, 5);
 * llmSpan.end();
 *
 * // Shutdown on exit
 * await provider.shutdown();
 * ```
 */

// =============================================================================
// Types - Core type definitions
// =============================================================================
export type {
  OpenTelemetryConfig,
  TracerConfig,
  MeterConfig,
  ExporterConfig,
  SamplerConfig,
  RedactionConfig,
  SpanAttributes,
  MetricAttributes,
  Context,
  Span,
  Tracer,
  Meter,
  Counter,
  Histogram,
  Link,
  KeyValue,
  SpanStatus,
  SpanContext,
  SpanOptions,
  BatchConfig,
  ResourceAttributes,
  OtlpProtocol,
} from './types/index.js';

export { SpanKind } from './types/index.js';

// =============================================================================
// Configuration - Config builders and environment parsing
// =============================================================================
export {
  ConfigBuilder,
  ConfigurationError,
  configFromEnv,
  validateConfig,
  createDefaultConfig,
  DEFAULT_OTLP_ENDPOINT,
  DEFAULT_PROTOCOL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_QUEUE_SIZE,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_EXPORT_TIMEOUT,
  DEFAULT_SAMPLE_RATE,
} from './config/index.js';

// =============================================================================
// Provider - Main TelemetryProvider for orchestrating observability
// =============================================================================
export {
  TelemetryProvider,
  ResourceBuilder,
  LogBridge,
  LogSeverity,
  type TelemetryConfig,
  type Resource,
  type Logger,
  type LogRecord,
  type ContextPropagator,
  type SpanBuilder as ProviderSpanBuilder,
  type Gauge as ProviderGauge,
  type UpDownCounter as ProviderUpDownCounter,
  type AttributeValue,
} from './provider/index.js';

// Re-export MetricOptions from types
export type { MetricOptions } from './types/index.js';

// =============================================================================
// Tracer - Span builder and tracing utilities
// =============================================================================
export {
  SpanBuilder as TracerSpanBuilder,
  SpanImpl,
  TracingHelper,
  generateTraceId,
  generateSpanId,
  isValidTraceId,
  isValidSpanId,
  createSpanContext,
  getSpanFromContext,
} from './tracer/index.js';

// =============================================================================
// Propagation - W3C TraceContext and Baggage
// =============================================================================
export {
  // Traceparent
  parseTraceparent,
  formatTraceparent,
  // Baggage
  Baggage,
  parseBaggage,
  formatBaggage,
  // TraceState
  parseTraceState,
  formatTraceState,
  // Context
  PropagationContext,
  Context as PropagationContextClass,
  // HTTP Headers
  injectHttpHeaders,
  extractHttpHeaders,
  // Propagators
  TraceContextPropagator,
  BaggagePropagator,
  CompositePropagator,
  // Global propagator
  setGlobalPropagator,
  getGlobalPropagator,
  inject,
  extract,
  type Propagator,
  type ExtendedSpanContext,
} from './propagation/index.js';

// =============================================================================
// Metrics - Metrics helper and instruments
// =============================================================================
export {
  MetricsHelper,
  LLM_LATENCY_BUCKETS,
  TOKEN_BUCKETS,
  COST_BUCKETS,
  type Gauge as MetricsGauge,
} from './metrics/index.js';

// =============================================================================
// LLM - LLM-specific tracing and metrics
// =============================================================================
export {
  // Semantic conventions
  GEN_AI_SYSTEM,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROMPT,
  GEN_AI_COMPLETION,
  GEN_AI_SYSTEM_PROMPT,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  GEN_AI_RESPONSE_FINISH_REASON,
  GEN_AI_LATENCY_MS,
  GEN_AI_TIME_TO_FIRST_TOKEN_MS,
  GEN_AI_TOKENS_PER_SECOND,
  // Agent semantic conventions
  AGENT_NAME,
  AGENT_STEP,
  AGENT_STEP_INDEX,
  AGENT_TOOL_CALL,
  AGENT_TOOL_NAME,
  AGENT_TOOL_INPUT,
  AGENT_MEMORY_QUERY,
  AGENT_MEMORY_RESULTS_COUNT,
  // Classes
  LLMSpanBuilder,
  LLMSpan,
  StreamingLLMSpan,
  AgentTracer,
  LLMMetrics,
  // Factory functions
  createLLMSpan,
  createAgentTracer,
  createLLMMetrics,
} from './llm/index.js';

// =============================================================================
// Security - Attribute redaction and cardinality limiting
// =============================================================================
export {
  // Redactor
  AttributeRedactor,
  CardinalityLimiter,
  // Configuration
  createRedactionConfig,
  truncateValue,
  // Patterns
  OPENAI_KEY_PATTERN,
  ANTHROPIC_KEY_PATTERN,
  AWS_ACCESS_KEY_PATTERN,
  EMAIL_PATTERN,
  CREDIT_CARD_PATTERN,
  JWT_PATTERN,
  DEFAULT_SENSITIVE_KEYS,
  DEFAULT_REDACTION_PATTERNS,
  type ExtendedRedactionConfig,
  type KeyValue as SecurityKeyValue,
} from './security/index.js';

// =============================================================================
// Export - Span exporters and batch processing
// =============================================================================
export {
  // Exporters
  MockSpanExporter,
  StdoutSpanExporter,
  OtlpExporter,
  ResilientExporter,
  // Batch processing
  BatchSpanProcessor,
  // Circuit breaker
  CircuitBreaker,
  // Types
  type SpanExporter,
  type SpanData,
  type ExportResult,
  type BatchConfig as ExportBatchConfig,
  type StdoutExporterOptions,
  type CircuitBreakerConfig,
  type ResilientExporterConfig,
} from './export/index.js';

// =============================================================================
// Version
// =============================================================================
export const VERSION = '0.1.0';
