/**
 * OpenTelemetry Integration Types
 *
 * Complete type definitions for the OpenTelemetry integration module,
 * providing interfaces for traces, metrics, logs, and LLM-specific observability.
 *
 * Following the SPARC specification for the LLM DevOps platform.
 *
 * @module types/common
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Main configuration for OpenTelemetry SDK initialization.
 */
export interface TelemetryConfig {
  /**
   * Service name identifying this application.
   */
  serviceName: string;

  /**
   * Service version (semver recommended).
   */
  serviceVersion?: string;

  /**
   * Deployment environment (e.g., "production", "staging", "development").
   */
  environment?: string;

  /**
   * Additional resource attributes for identifying this service instance.
   */
  resourceAttributes?: Record<string, AttributeValue>;

  /**
   * Exporter configuration for sending telemetry data.
   */
  exporterConfig: ExporterConfig;

  /**
   * Sampling configuration for controlling trace volume.
   */
  samplingConfig?: SamplingConfig;

  /**
   * Batch processing configuration for spans and metrics.
   */
  batchConfig?: BatchConfig;

  /**
   * Redaction configuration for sensitive data protection.
   */
  redactionConfig?: RedactionConfig;

  /**
   * Enable debug logging for the SDK itself.
   */
  debug?: boolean;
}

/**
 * Legacy alias for TelemetryConfig for backward compatibility.
 */
export interface OpenTelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  tracerConfig?: TracerConfig;
  meterConfig?: MeterConfig;
  exporterConfig?: ExporterConfig;
  samplerConfig?: SamplerConfig;
  redactionConfig?: RedactionConfig;
}

/**
 * Tracer Configuration
 */
export interface TracerConfig {
  enabled?: boolean;
  tracerName?: string;
  tracerVersion?: string;
}

/**
 * Meter Configuration
 */
export interface MeterConfig {
  enabled?: boolean;
  meterName?: string;
  meterVersion?: string;
}

/**
 * Configuration for telemetry data export.
 */
export interface ExporterConfig {
  /**
   * Export protocol to use.
   */
  protocol: ExportProtocol;

  /**
   * OTLP collector endpoint URL.
   */
  endpoint: string;

  /**
   * Export timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Custom headers to include in export requests (e.g., API keys).
   */
  headers?: Record<string, string>;

  /**
   * TLS/SSL configuration for secure transport.
   */
  tlsConfig?: TlsConfig;

  /**
   * Compression algorithm for export payloads.
   */
  compression?: CompressionAlgorithm;

  /**
   * Legacy field for backward compatibility.
   */
  type?: 'otlp' | 'console' | 'jaeger' | 'zipkin';

  /**
   * Legacy batch config (prefer top-level batchConfig in TelemetryConfig).
   */
  batchConfig?: BatchConfig;
}

/**
 * Export protocol options.
 */
export type ExportProtocol = 'grpc' | 'http/protobuf' | 'http/json';

/**
 * Compression algorithms for export payloads.
 */
export type CompressionAlgorithm = 'gzip' | 'none';

/**
 * TLS/SSL configuration for secure connections.
 */
export interface TlsConfig {
  /**
   * Whether to verify server certificates.
   * @default true
   */
  verifyCertificate?: boolean;

  /**
   * Path to CA certificate file for verification.
   */
  caCertPath?: string;

  /**
   * Client certificate for mTLS authentication.
   */
  clientCertPath?: string;

  /**
   * Client private key for mTLS authentication.
   */
  clientKeyPath?: string;
}

/**
 * Batch processing configuration for spans and metrics.
 */
export interface BatchConfig {
  /**
   * Maximum number of spans to queue before forcing export.
   * @default 2048
   */
  maxQueueSize?: number;

  /**
   * Maximum number of spans per export batch.
   * @default 512
   */
  maxBatchSize?: number;

  /**
   * Time in milliseconds to wait before exporting a partial batch.
   * @default 5000
   */
  batchTimeout?: number;

  /**
   * Timeout in milliseconds for export operations.
   * @default 30000
   */
  exportTimeout?: number;

  /**
   * Legacy aliases for backward compatibility.
   */
  maxExportBatchSize?: number;
  scheduledDelayMillis?: number;
  exportTimeoutMillis?: number;
}

/**
 * Sampling configuration for controlling trace data volume.
 */
export interface SamplingConfig {
  /**
   * Sampling strategy to use.
   */
  strategy: SamplingStrategy;

  /**
   * Sampling rate (0.0 to 1.0) for TraceIdRatio strategy.
   * @default 0.1
   */
  ratio?: number;

  /**
   * Root span sampler for ParentBased strategy.
   */
  rootSampler?: SamplingStrategy;
}

/**
 * Legacy alias for backward compatibility.
 */
export interface SamplerConfig {
  type?: 'always_on' | 'always_off' | 'trace_id_ratio' | 'parent_based';
  ratio?: number;
  strategy?: SamplingStrategy;
  rootSampler?: SamplingStrategy;
}

/**
 * Sampling strategy types.
 */
export type SamplingStrategy =
  | 'AlwaysOn'      // Sample all traces (100%)
  | 'AlwaysOff'     // Sample no traces (0%)
  | 'TraceIdRatio'  // Sample based on trace ID hash
  | 'ParentBased';  // Inherit from parent span

/**
 * Configuration for redacting sensitive data from telemetry.
 */
export interface RedactionConfig {
  /**
   * Whether to redact LLM prompts from spans.
   * @default false
   */
  redactPrompts?: boolean;

  /**
   * Whether to redact LLM completions from spans.
   * @default false
   */
  redactCompletions?: boolean;

  /**
   * Whether to redact tool inputs from spans.
   * @default false
   */
  redactToolInputs?: boolean;

  /**
   * Legacy alias for redactCompletions.
   */
  redactResponses?: boolean;

  /**
   * Regular expressions for matching sensitive data to redact.
   */
  redactionPatterns?: RegExp[];

  /**
   * Legacy alias for redactionPatterns.
   */
  customRedactionPatterns?: RegExp[];

  /**
   * Attribute keys that should always be redacted.
   */
  sensitiveKeys?: string[];

  /**
   * Replacement text for redacted values.
   * @default "[REDACTED]"
   */
  redactionPlaceholder?: string;
}

/**
 * Resource attributes type.
 */
export type ResourceAttributes = Record<string, string | number | boolean>;

/**
 * OTLP Protocol type alias (legacy).
 */
export type OtlpProtocol = 'grpc' | 'http';

// ============================================================================
// Attribute Types
// ============================================================================

/**
 * Valid attribute value types.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

/**
 * Collection of key-value attributes for spans.
 */
export interface SpanAttributes {
  [key: string]: AttributeValue | undefined;
}

/**
 * Collection of key-value attributes for metrics.
 */
export interface MetricAttributes {
  [key: string]: string | number | boolean;
}

/**
 * Key-value pair for attributes.
 */
export interface KeyValue {
  /**
   * Attribute key.
   */
  key: string;

  /**
   * Attribute value.
   */
  value: AttributeValue;
}

// ============================================================================
// Span Types
// ============================================================================

/**
 * OpenTelemetry Context
 */
export interface Context {
  setValue(key: symbol, value: unknown): Context;
  getValue(key: symbol): unknown;
}

/**
 * OpenTelemetry Span
 */
export interface Span {
  setAttribute(key: string, value: string | number | boolean | string[] | number[] | boolean[]): this;
  setAttributes(attributes: SpanAttributes): this;
  addEvent(name: string, attributes?: SpanAttributes, timestamp?: number): this;
  setStatus(status: SpanStatus): this;
  end(endTime?: number): void;
  recordException(exception: Error, time?: number): void;
  spanContext(): SpanContext;
  isRecording(): boolean;
}

/**
 * Trace flags for controlling trace behavior.
 */
export enum TraceFlags {
  /** No flags set. */
  NONE = 0,
  /** Trace is sampled. */
  SAMPLED = 1,
}

/**
 * Span context identifies a span within a trace.
 */
export interface SpanContext {
  /**
   * Unique trace identifier (16 bytes, hex-encoded).
   */
  traceId: string;

  /**
   * Unique span identifier (8 bytes, hex-encoded).
   */
  spanId: string;

  /**
   * Trace flags (e.g., sampled bit).
   */
  traceFlags: TraceFlags | number;

  /**
   * Whether this context was extracted from a remote source.
   */
  isRemote?: boolean;

  /**
   * Trace state for vendor-specific context propagation.
   */
  traceState?: unknown;
}

/**
 * Event recorded within a span's lifetime.
 */
export interface Event {
  /**
   * Event name.
   */
  name: string;

  /**
   * Timestamp when the event occurred (microseconds since epoch).
   */
  timestamp?: number;

  /**
   * Event attributes.
   */
  attributes?: SpanAttributes;
}

/**
 * OpenTelemetry Tracer
 */
export interface Tracer {
  startSpan(name: string, options?: SpanOptions, context?: Context): Span;
}

/**
 * Options for span creation.
 */
export interface SpanOptions {
  /**
   * Span kind.
   */
  kind?: SpanKind | number;

  /**
   * Initial attributes.
   */
  attributes?: SpanAttributes;

  /**
   * Links to other spans.
   */
  links?: Link[];

  /**
   * Start timestamp (microseconds since epoch).
   */
  startTime?: number;

  /**
   * Whether this is a root span (no parent).
   */
  root?: boolean;
}

/**
 * Options for ending a span.
 */
export interface SpanEndOptions {
  /**
   * End timestamp (microseconds since epoch).
   */
  endTime?: number;

  /**
   * Final status code.
   */
  statusCode?: SpanStatusCode;

  /**
   * Status message (typically for errors).
   */
  statusMessage?: string;
}

/**
 * Span status code indicating the result of the operation.
 */
export enum SpanStatusCode {
  /** Operation completed successfully. */
  OK = 0,
  /** Operation failed with an error. */
  ERROR = 1,
  /** Status not set. */
  UNSET = 2,
}

/**
 * Span Link
 */
export interface Link {
  context: SpanContext;
  attributes?: SpanAttributes;
}

/**
 * OpenTelemetry Meter
 */
export interface Meter {
  createCounter(name: string, options?: MetricOptions): Counter;
  createHistogram(name: string, options?: MetricOptions): Histogram;
  createUpDownCounter(name: string, options?: MetricOptions): UpDownCounter;
  createObservableGauge(name: string, options?: MetricOptions): ObservableGauge;
}

/**
 * Metric Options
 */
export interface MetricOptions {
  description?: string;
  unit?: string;
  valueType?: 'int' | 'double';
}

/**
 * Counter
 */
export interface Counter {
  add(value: number, attributes?: MetricAttributes): void;
}

/**
 * Histogram
 */
export interface Histogram {
  record(value: number, attributes?: MetricAttributes): void;
}

/**
 * UpDownCounter
 */
export interface UpDownCounter {
  add(value: number, attributes?: MetricAttributes): void;
}

/**
 * Observable Gauge
 */
export interface ObservableGauge {
  // Observable metrics are created with callback functions
}

/**
 * Span kind indicates the type of operation a span represents.
 */
export enum SpanKind {
  /** Internal operation within the service. */
  INTERNAL = 'INTERNAL',
  /** Server-side handling of synchronous RPC or HTTP request. */
  SERVER = 'SERVER',
  /** Client-side call to remote service. */
  CLIENT = 'CLIENT',
  /** Producer of messages sent to a broker. */
  PRODUCER = 'PRODUCER',
  /** Consumer of messages from a broker. */
  CONSUMER = 'CONSUMER',
}

/**
 * Span status with code and optional message.
 */
export interface SpanStatus {
  /**
   * Status code.
   */
  code: SpanStatusCode | 'OK' | 'ERROR' | 'UNSET';

  /**
   * Optional status message (typically for errors).
   */
  message?: string;
}

// ============================================================================
// Metric Types
// ============================================================================

/**
 * Metric instrument types.
 */
export enum MetricInstrumentType {
  /** Monotonically increasing counter. */
  Counter = 'Counter',
  /** Counter that can increase or decrease. */
  UpDownCounter = 'UpDownCounter',
  /** Records distribution of values. */
  Histogram = 'Histogram',
  /** Records current value at a point in time. */
  Gauge = 'Gauge',
}

/**
 * Configuration for creating a metric instrument.
 */
export interface MetricInstrumentConfig {
  /**
   * Instrument name.
   */
  name: string;

  /**
   * Instrument type.
   */
  type: MetricInstrumentType;

  /**
   * Human-readable description.
   */
  description?: string;

  /**
   * Unit of measurement (e.g., "ms", "bytes", "1").
   */
  unit?: string;
}

/**
 * Metric data point.
 */
export interface MetricDataPoint {
  /**
   * Measurement value.
   */
  value: number;

  /**
   * Attributes for this data point.
   */
  attributes?: MetricAttributes;

  /**
   * Timestamp when the measurement was taken.
   */
  timestamp: number;
}

// ============================================================================
// Log Types
// ============================================================================

/**
 * Log severity levels matching OpenTelemetry specification.
 */
export enum LogSeverity {
  /** Trace-level logging. */
  TRACE = 1,
  /** Debug-level logging. */
  DEBUG = 5,
  /** Informational messages. */
  INFO = 9,
  /** Warning messages. */
  WARN = 13,
  /** Error messages. */
  ERROR = 17,
  /** Fatal error messages. */
  FATAL = 21,
}

/**
 * Structured log record.
 */
export interface LogRecord {
  /**
   * Log timestamp (microseconds since epoch).
   */
  timestamp: number;

  /**
   * Observed timestamp (when log was received).
   */
  observedTimestamp?: number;

  /**
   * Log severity level.
   */
  severity: LogSeverity;

  /**
   * Severity text (e.g., "ERROR", "INFO").
   */
  severityText?: string;

  /**
   * Log message body.
   */
  body: string | Record<string, unknown>;

  /**
   * Log attributes.
   */
  attributes?: SpanAttributes;

  /**
   * Trace context (if correlated with a trace).
   */
  traceContext?: {
    traceId: string;
    spanId: string;
    traceFlags: TraceFlags | number;
  };
}

// ============================================================================
// LLM Semantic Conventions
// ============================================================================

/**
 * Standard attributes for LLM operations following emerging semantic conventions.
 */
export interface LLMAttributes {
  /**
   * LLM system/provider (e.g., "openai", "anthropic", "cohere").
   */
  'gen_ai.system'?: string;

  /**
   * Model identifier used for the request.
   */
  'gen_ai.request.model'?: string;

  /**
   * Maximum tokens requested from the model.
   */
  'gen_ai.request.max_tokens'?: number;

  /**
   * Temperature parameter for randomness.
   */
  'gen_ai.request.temperature'?: number;

  /**
   * Top-p (nucleus sampling) parameter.
   */
  'gen_ai.request.top_p'?: number;

  /**
   * Model identifier returned in the response.
   */
  'gen_ai.response.model'?: string;

  /**
   * Input tokens consumed by the request.
   */
  'gen_ai.usage.input_tokens'?: number;

  /**
   * Output tokens generated in the response.
   */
  'gen_ai.usage.output_tokens'?: number;

  /**
   * Reason the model stopped generating (e.g., "stop", "length", "tool_use").
   */
  'gen_ai.response.finish_reason'?: string;

  /**
   * Full prompt text (may be redacted for security).
   */
  'gen_ai.prompt'?: string;

  /**
   * Full completion text (may be redacted for security).
   */
  'gen_ai.completion'?: string;

  /**
   * Whether the response was streamed.
   */
  'gen_ai.response.streaming'?: boolean;

  /**
   * Time to first token in milliseconds (for streaming).
   */
  'gen_ai.response.ttft_ms'?: number;

  /**
   * Estimated cost of the request in USD.
   */
  'gen_ai.cost.usd'?: number;
}

/**
 * Standard attributes for agent operations.
 */
export interface AgentAttributes {
  /**
   * Name of the agent.
   */
  'agent.name'?: string;

  /**
   * Current step number in the agent's execution.
   */
  'agent.step'?: number;

  /**
   * Type of agent step (e.g., "reasoning", "tool_call", "observation").
   */
  'agent.step.type'?: string;

  /**
   * Tool being called by the agent.
   */
  'agent.tool_call'?: string;

  /**
   * Tool call arguments (JSON string).
   */
  'agent.tool_call.args'?: string;

  /**
   * Tool call result (JSON string).
   */
  'agent.tool_call.result'?: string;

  /**
   * Name of the parent agent (for multi-agent systems).
   */
  'agent.parent_agent'?: string;

  /**
   * Agent session or conversation ID.
   */
  'agent.session_id'?: string;

  /**
   * Agent goal or objective.
   */
  'agent.goal'?: string;

  /**
   * Whether the agent completed its goal successfully.
   */
  'agent.completed'?: boolean;

  /**
   * Number of iterations taken by the agent.
   */
  'agent.iterations'?: number;
}

/**
 * Combined semantic convention attributes for LLM and agent operations.
 */
export type SemanticAttributes = LLMAttributes & AgentAttributes & SpanAttributes;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error kind enumeration for categorizing OpenTelemetry errors.
 */
export enum OtelErrorKind {
  // Configuration errors
  /** Invalid endpoint URL. */
  InvalidEndpoint = 'invalid_endpoint',
  /** Invalid export protocol. */
  InvalidProtocol = 'invalid_protocol',
  /** Missing required provider. */
  MissingProvider = 'missing_provider',
  /** Invalid sampler configuration. */
  InvalidSamplerConfig = 'invalid_sampler_config',
  /** Invalid TLS configuration. */
  InvalidTlsConfig = 'invalid_tls_config',

  // Export errors
  /** Connection to collector failed. */
  ConnectionFailed = 'connection_failed',
  /** Export operation timed out. */
  ExportTimeout = 'export_timeout',
  /** Export batch was dropped. */
  BatchDropped = 'batch_dropped',
  /** Export queue is full. */
  QueueFull = 'queue_full',
  /** Failed to serialize telemetry data. */
  SerializationFailed = 'serialization_failed',
  /** Network error during export. */
  NetworkError = 'network_error',

  // Propagation errors
  /** Invalid trace context header. */
  InvalidTraceContext = 'invalid_trace_context',
  /** Invalid baggage header. */
  InvalidBaggage = 'invalid_baggage',
  /** Failed to parse propagation headers. */
  HeaderParseError = 'header_parse_error',

  // Instrumentation errors
  /** Span not found. */
  SpanNotFound = 'span_not_found',
  /** Invalid attribute value or type. */
  InvalidAttribute = 'invalid_attribute',
  /** Meter not initialized. */
  MeterNotInitialized = 'meter_not_initialized',
  /** Tracer not initialized. */
  TracerNotInitialized = 'tracer_not_initialized',
  /** Logger not initialized. */
  LoggerNotInitialized = 'logger_not_initialized',

  // Shutdown errors
  /** Flush operation timed out. */
  FlushTimeout = 'flush_timeout',
  /** Provider shutdown failed. */
  ProviderShutdownFailed = 'provider_shutdown_failed',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Base error class for OpenTelemetry operations.
 */
export class OtelError extends Error {
  /** Error kind for categorization. */
  public readonly kind: OtelErrorKind;
  /** Whether this error is retryable. */
  public readonly retryable: boolean;
  /** Underlying cause of the error. */
  public readonly cause?: Error;

  constructor(
    kind: OtelErrorKind,
    message: string,
    options?: {
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'OtelError';
    this.kind = kind;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OtelError);
    }
  }

  /**
   * Sets the underlying cause.
   */
  withCause(cause: Error): this {
    return new OtelError(this.kind, this.message, {
      retryable: this.retryable,
      cause,
    }) as this;
  }

  /**
   * Marks this error as retryable.
   */
  asRetryable(): this {
    return new OtelError(this.kind, this.message, {
      retryable: true,
      cause: this.cause,
    }) as this;
  }

  /**
   * Formats the error for display.
   */
  toString(): string {
    let result = `[${this.kind}] ${this.message}`;
    if (this.retryable) {
      result += ' (retryable)';
    }
    return result;
  }
}

/**
 * Configuration error - invalid or missing configuration.
 */
export class ConfigurationError extends OtelError {
  constructor(message: string, options?: { cause?: Error }) {
    super(OtelErrorKind.InvalidEndpoint, message, {
      retryable: false,
      ...options,
    });
    this.name = 'ConfigurationError';
  }

  static invalidEndpoint(endpoint: string): ConfigurationError {
    return new ConfigurationError(`Invalid endpoint: ${endpoint}`);
  }

  static invalidProtocol(protocol: string): ConfigurationError {
    return new ConfigurationError(`Invalid protocol: ${protocol}`);
  }

  static missingProvider(providerType: string): ConfigurationError {
    return new ConfigurationError(`Missing ${providerType} provider`);
  }

  static invalidSamplerConfig(message: string): ConfigurationError {
    return new ConfigurationError(`Invalid sampler config: ${message}`);
  }
}

/**
 * Export error - failure during telemetry export.
 */
export class ExportError extends OtelError {
  constructor(
    kind: OtelErrorKind,
    message: string,
    options?: { retryable?: boolean; cause?: Error }
  ) {
    super(kind, message, options);
    this.name = 'ExportError';
  }

  static connectionFailed(endpoint: string, cause?: Error): ExportError {
    return new ExportError(
      OtelErrorKind.ConnectionFailed,
      `Failed to connect to ${endpoint}`,
      { retryable: true, cause }
    );
  }

  static timeout(message: string): ExportError {
    return new ExportError(OtelErrorKind.ExportTimeout, message, {
      retryable: false,
    });
  }

  static batchDropped(reason: string): ExportError {
    return new ExportError(OtelErrorKind.BatchDropped, `Batch dropped: ${reason}`, {
      retryable: false,
    });
  }

  static queueFull(queueSize: number): ExportError {
    return new ExportError(
      OtelErrorKind.QueueFull,
      `Queue full (size: ${queueSize})`,
      { retryable: false }
    );
  }

  static serializationFailed(message: string, cause?: Error): ExportError {
    return new ExportError(
      OtelErrorKind.SerializationFailed,
      `Serialization failed: ${message}`,
      { retryable: false, cause }
    );
  }
}

/**
 * Propagation error - failure during context propagation.
 */
export class PropagationError extends OtelError {
  constructor(
    kind: OtelErrorKind,
    message: string,
    options?: { cause?: Error }
  ) {
    super(kind, message, { retryable: false, ...options });
    this.name = 'PropagationError';
  }

  static invalidTraceContext(message: string): PropagationError {
    return new PropagationError(
      OtelErrorKind.InvalidTraceContext,
      `Invalid trace context: ${message}`
    );
  }

  static invalidBaggage(message: string): PropagationError {
    return new PropagationError(
      OtelErrorKind.InvalidBaggage,
      `Invalid baggage: ${message}`
    );
  }

  static headerParseError(header: string, cause?: Error): PropagationError {
    return new PropagationError(
      OtelErrorKind.HeaderParseError,
      `Failed to parse header: ${header}`,
      { cause }
    );
  }
}

/**
 * Instrumentation error - failure during span/metric/log operations.
 */
export class InstrumentationError extends OtelError {
  constructor(
    kind: OtelErrorKind,
    message: string,
    options?: { cause?: Error }
  ) {
    super(kind, message, { retryable: false, ...options });
    this.name = 'InstrumentationError';
  }

  static spanNotFound(spanId: string): InstrumentationError {
    return new InstrumentationError(
      OtelErrorKind.SpanNotFound,
      `Span not found: ${spanId}`
    );
  }

  static invalidAttribute(key: string, value: unknown): InstrumentationError {
    return new InstrumentationError(
      OtelErrorKind.InvalidAttribute,
      `Invalid attribute ${key}: ${String(value)}`
    );
  }

  static meterNotInitialized(): InstrumentationError {
    return new InstrumentationError(
      OtelErrorKind.MeterNotInitialized,
      'Meter provider not initialized'
    );
  }

  static tracerNotInitialized(): InstrumentationError {
    return new InstrumentationError(
      OtelErrorKind.TracerNotInitialized,
      'Tracer provider not initialized'
    );
  }

  static loggerNotInitialized(): InstrumentationError {
    return new InstrumentationError(
      OtelErrorKind.LoggerNotInitialized,
      'Logger provider not initialized'
    );
  }
}

/**
 * Shutdown error - failure during provider shutdown.
 */
export class ShutdownError extends OtelError {
  constructor(
    kind: OtelErrorKind,
    message: string,
    options?: { cause?: Error }
  ) {
    super(kind, message, { retryable: false, ...options });
    this.name = 'ShutdownError';
  }

  static flushTimeout(timeout: number): ShutdownError {
    return new ShutdownError(
      OtelErrorKind.FlushTimeout,
      `Flush timed out after ${timeout}ms`
    );
  }

  static providerShutdownFailed(providerType: string, cause?: Error): ShutdownError {
    return new ShutdownError(
      OtelErrorKind.ProviderShutdownFailed,
      `${providerType} provider shutdown failed`,
      { cause }
    );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for OtelError.
 */
export function isOtelError(error: unknown): error is OtelError {
  return error instanceof OtelError;
}

/**
 * Type guard for ConfigurationError.
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

/**
 * Type guard for ExportError.
 */
export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}

/**
 * Type guard for PropagationError.
 */
export function isPropagationError(error: unknown): error is PropagationError {
  return error instanceof PropagationError;
}

/**
 * Type guard for InstrumentationError.
 */
export function isInstrumentationError(error: unknown): error is InstrumentationError {
  return error instanceof InstrumentationError;
}

/**
 * Type guard for ShutdownError.
 */
export function isShutdownError(error: unknown): error is ShutdownError {
  return error instanceof ShutdownError;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Context carrier for propagation (e.g., HTTP headers).
 */
export type ContextCarrier = Record<string, string | string[] | undefined>;

/**
 * Result of a telemetry export operation.
 */
export interface ExportResult {
  /**
   * Whether the export succeeded.
   */
  success: boolean;

  /**
   * Error if the export failed.
   */
  error?: OtelError;

  /**
   * Number of items exported.
   */
  exportedCount?: number;

  /**
   * Number of items dropped.
   */
  droppedCount?: number;
}

/**
 * Health status of the OpenTelemetry SDK.
 */
export interface HealthStatus {
  /**
   * Whether the SDK is healthy.
   */
  healthy: boolean;

  /**
   * Current queue size.
   */
  queueSize: number;

  /**
   * Number of successful exports.
   */
  exportSuccessCount: number;

  /**
   * Number of failed exports.
   */
  exportFailureCount: number;

  /**
   * Number of dropped spans.
   */
  droppedSpanCount: number;

  /**
   * Last export error, if any.
   */
  lastError?: OtelError;
}
