/**
 * Observability types for the Weaviate client.
 *
 * Defines interfaces for tracing, metrics, logging, and health checks.
 */

// ============================================================================
// Tracing Types
// ============================================================================

/**
 * Span status
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Span interface for distributed tracing
 */
export interface Span {
  /** Span ID */
  id: string;
  /** Parent span ID */
  parentId?: string;
  /** Trace ID */
  traceId: string;
  /** Operation name */
  name: string;
  /** Start time (ms since epoch) */
  startTime: number;
  /** End time (ms since epoch) */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Span status */
  status?: SpanStatus;
  /** Attributes */
  attributes: Record<string, string | number | boolean>;
  /** Events */
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean>;
  }>;

  /**
   * Start the span
   */
  start(): void;

  /**
   * End the span
   */
  end(status?: SpanStatus): void;

  /**
   * Set an attribute
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Record an error
   */
  recordError(error: Error): void;

  /**
   * Add an event
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;

  /**
   * End a span
   */
  endSpan(span: Span, status?: SpanStatus): void;

  /**
   * Get active span
   */
  getActiveSpan(): Span | undefined;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Metric value type
 */
export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  /**
   * Increment a counter
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record request timing
   */
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void;

  /**
   * Get all metrics
   */
  getMetrics(): Map<string, MetricValue[]>;
}

// ============================================================================
// Logging Types
// ============================================================================

/**
 * Log level
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health status
 */
export enum HealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unhealthy = 'unhealthy',
}

/**
 * Component health check result
 */
export interface ComponentHealth {
  /** Component name */
  name: string;
  /** Health status */
  status: HealthStatus;
  /** Status message */
  message?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp of check */
  timestamp: number;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  /** Overall status */
  status: HealthStatus;
  /** Component checks */
  components: ComponentHealth[];
  /** Timestamp of check */
  timestamp: number;
}

/**
 * Health check interface
 */
export interface HealthCheck {
  /**
   * Perform health check
   */
  check(): Promise<HealthCheckResult>;

  /**
   * Check individual component
   */
  checkComponent(name: string): Promise<ComponentHealth>;
}

// ============================================================================
// Observability Context
// ============================================================================

/**
 * Combined observability context
 */
export interface ObservabilityContext {
  tracer: Tracer;
  metrics: MetricsCollector;
  logger: Logger;
}

// ============================================================================
// Metric Names Constants
// ============================================================================

/**
 * Standard metric names for Weaviate operations
 */
export const MetricNames = {
  // Object operations
  OBJECT_CREATE: 'weaviate.object.create',
  OBJECT_GET: 'weaviate.object.get',
  OBJECT_UPDATE: 'weaviate.object.update',
  OBJECT_DELETE: 'weaviate.object.delete',

  // Batch operations
  BATCH_OBJECTS: 'weaviate.batch.objects',
  BATCH_ERRORS: 'weaviate.batch.errors',

  // Search operations
  SEARCH_NEAR_VECTOR: 'weaviate.search.near_vector',
  SEARCH_NEAR_TEXT: 'weaviate.search.near_text',
  SEARCH_NEAR_OBJECT: 'weaviate.search.near_object',
  SEARCH_HYBRID: 'weaviate.search.hybrid',
  SEARCH_BM25: 'weaviate.search.bm25',

  // Latency metrics
  SEARCH_LATENCY_MS: 'weaviate.search.latency_ms',
  GRAPHQL_LATENCY_MS: 'weaviate.graphql.latency_ms',
  GRPC_LATENCY_MS: 'weaviate.grpc.latency_ms',
  REST_LATENCY_MS: 'weaviate.rest.latency_ms',

  // Error metrics
  ERROR: 'weaviate.error',

  // Schema operations
  SCHEMA_GET: 'weaviate.schema.get',
  SCHEMA_CACHE_HIT: 'weaviate.schema.cache.hit',
  SCHEMA_CACHE_MISS: 'weaviate.schema.cache.miss',

  // Connection metrics
  CONNECTION_ACTIVE: 'weaviate.connection.active',
  CONNECTION_ERROR: 'weaviate.connection.error',
} as const;

/**
 * Standard span names for Weaviate operations
 */
export const SpanNames = {
  // Object operations
  CREATE_OBJECT: 'weaviate.create_object',
  GET_OBJECT: 'weaviate.get_object',
  UPDATE_OBJECT: 'weaviate.update_object',
  DELETE_OBJECT: 'weaviate.delete_object',

  // Batch operations
  BATCH_CREATE: 'weaviate.batch_create',

  // Search operations
  NEAR_VECTOR: 'weaviate.near_vector',
  NEAR_TEXT: 'weaviate.near_text',
  NEAR_OBJECT: 'weaviate.near_object',
  HYBRID: 'weaviate.hybrid',
  BM25: 'weaviate.bm25',

  // GraphQL operations
  GRAPHQL_QUERY: 'weaviate.graphql',

  // Internal operations
  BUILD_GRAPHQL: 'weaviate.build_graphql',
  PARSE_RESULTS: 'weaviate.parse_results',
  VALIDATE_VECTOR: 'weaviate.validate_vector',
  CHUNK_OBJECTS: 'weaviate.chunk_objects',
} as const;

/**
 * Standard span attributes
 */
export const SpanAttributes = {
  // Operation attributes
  OPERATION: 'operation',
  CLASS_NAME: 'class_name',
  TENANT: 'tenant',
  DURATION_MS: 'duration_ms',

  // Result attributes
  RESULT_COUNT: 'result_count',
  BATCH_SIZE: 'batch_size',
  ERROR_COUNT: 'error_count',

  // Search attributes
  VECTOR_DIMENSION: 'vector_dimension',
  CERTAINTY: 'certainty',
  DISTANCE: 'distance',
  LIMIT: 'limit',
  OFFSET: 'offset',

  // Transport attributes
  TRANSPORT: 'transport',
  ENDPOINT: 'endpoint',
  STATUS_CODE: 'status_code',
} as const;
