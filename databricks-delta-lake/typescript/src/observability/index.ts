/**
 * Observability components for the Databricks Delta Lake client.
 *
 * Includes tracing, metrics, and logging for:
 * - Job execution and monitoring
 * - SQL query execution
 * - Delta Lake operations
 * - Schema evolution
 * - API interactions
 */

// ============================================================================
// Tracing
// ============================================================================

/**
 * Span status
 */
export type SpanStatus = 'ok' | 'error' | 'cancelled';

/**
 * Request span for distributed tracing
 */
export interface RequestSpan {
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
}

/**
 * Tracer interface
 */
export interface Tracer {
  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan;

  /**
   * End a span
   */
  endSpan(span: RequestSpan, status?: SpanStatus): void;

  /**
   * Add an event to a span
   */
  addEvent(
    span: RequestSpan,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void;

  /**
   * Set span attributes
   */
  setAttributes(span: RequestSpan, attributes: Record<string, string | number | boolean>): void;

  /**
   * Get active span
   */
  getActiveSpan(): RequestSpan | undefined;
}

/**
 * No-op tracer implementation
 */
export class NoopTracer implements Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan {
    return {
      id: '',
      traceId: '',
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
    };
  }

  endSpan(_span: RequestSpan, _status?: SpanStatus): void {
    // No-op
  }

  addEvent(
    _span: RequestSpan,
    _name: string,
    _attributes?: Record<string, string | number | boolean>
  ): void {
    // No-op
  }

  setAttributes(
    _span: RequestSpan,
    _attributes: Record<string, string | number | boolean>
  ): void {
    // No-op
  }

  getActiveSpan(): RequestSpan | undefined {
    return undefined;
  }
}

/**
 * Console-based tracer for development
 */
export class ConsoleTracer implements Tracer {
  private activeSpan?: RequestSpan;
  private spanIdCounter = 0;
  private traceIdCounter = 0;

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): RequestSpan {
    const span: RequestSpan = {
      id: `span-${++this.spanIdCounter}`,
      traceId: this.activeSpan?.traceId ?? `trace-${++this.traceIdCounter}`,
      parentId: this.activeSpan?.id,
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      events: [],
    };

    this.activeSpan = span;
    console.log(`[TRACE] Started span: ${name}`, { spanId: span.id, traceId: span.traceId });

    return span;
  }

  endSpan(span: RequestSpan, status: SpanStatus = 'ok'): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    console.log(`[TRACE] Ended span: ${span.name}`, {
      spanId: span.id,
      duration: span.duration,
      status,
    });

    if (this.activeSpan?.id === span.id) {
      this.activeSpan = undefined;
    }
  }

  addEvent(
    span: RequestSpan,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });

    console.log(`[TRACE] Event: ${name}`, { spanId: span.id, attributes });
  }

  setAttributes(span: RequestSpan, attributes: Record<string, string | number | boolean>): void {
    Object.assign(span.attributes, attributes);
  }

  getActiveSpan(): RequestSpan | undefined {
    return this.activeSpan;
  }
}

// ============================================================================
// Metrics
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

/**
 * No-op metrics collector
 */
export class NoopMetricsCollector implements MetricsCollector {
  increment(_name: string, _value?: number, _labels?: Record<string, string>): void {
    // No-op
  }

  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  histogram(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op
  }

  recordTiming(_name: string, _durationMs: number, _labels?: Record<string, string>): void {
    // No-op
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map();
  }
}

/**
 * In-memory metrics collector for testing and development
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private metrics = new Map<string, MetricValue[]>();
  private counters = new Map<string, number>();

  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);

    this.record(name, current + value, labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.histogram(`${name}_duration_ms`, durationMs, labels);
  }

  getMetrics(): Map<string, MetricValue[]> {
    return new Map(this.metrics);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.buildKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }

  private record(name: string, value: number, labels?: Record<string, string>): void {
    const values = this.metrics.get(name) ?? [];
    values.push({
      value,
      timestamp: Date.now(),
      labels,
    });
    this.metrics.set(name, values);
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log level
 */
export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
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
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
}

/**
 * No-op logger implementation
 */
export class NoopLogger implements Logger {
  trace(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  debug(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  info(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  setLevel(_level: LogLevel): void {
    // No-op
  }
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.Info;
  private readonly name?: string;

  constructor(name?: string, level?: LogLevel) {
    this.name = name;
    if (level !== undefined) {
      this.level = level;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Trace, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level]?.toUpperCase() ?? 'UNKNOWN';
    const prefix = this.name ? `[${this.name}]` : '';

    const logFn =
      level === LogLevel.Error
        ? console.error
        : level === LogLevel.Warn
          ? console.warn
          : level === LogLevel.Debug
            ? console.debug
            : level === LogLevel.Trace
              ? console.debug
              : console.log;

    if (context && Object.keys(context).length > 0) {
      // Redact sensitive values
      const safeContext = this.redactSensitive(context);
      logFn(`${timestamp} ${levelStr}${prefix} ${message}`, safeContext);
    } else {
      logFn(`${timestamp} ${levelStr}${prefix} ${message}`);
    }
  }

  private redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'apiKey',
      'api_key',
      'authorization',
      'token',
      'password',
      'secret',
      'pat',
      'access_token',
      'refresh_token',
      'client_secret',
    ];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
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

/**
 * Create a default observability context
 */
export function createDefaultObservability(): ObservabilityContext {
  return {
    tracer: new NoopTracer(),
    metrics: new NoopMetricsCollector(),
    logger: new ConsoleLogger('databricks-delta-lake'),
  };
}

/**
 * Create a development observability context with all logging enabled
 */
export function createDevObservability(): ObservabilityContext {
  return {
    tracer: new ConsoleTracer(),
    metrics: new InMemoryMetricsCollector(),
    logger: new ConsoleLogger('databricks-delta-lake', LogLevel.Debug),
  };
}

/**
 * Create a test observability context with in-memory collectors
 */
export function createTestObservability(): ObservabilityContext {
  return {
    tracer: new ConsoleTracer(),
    metrics: new InMemoryMetricsCollector(),
    logger: new ConsoleLogger('databricks-delta-lake', LogLevel.Trace),
  };
}

// ============================================================================
// Databricks-specific Tracing Spans
// ============================================================================

/**
 * Span names for Databricks operations
 */
export const DatabricksSpans = {
  // Job operations
  JOB_SUBMIT: 'databricks.job.submit',
  JOB_STATUS: 'databricks.job.status',
  JOB_CANCEL: 'databricks.job.cancel',
  JOB_OUTPUT: 'databricks.job.output',

  // SQL operations
  SQL_EXECUTE: 'databricks.sql.execute',
  SQL_FETCH: 'databricks.sql.fetch',
  SQL_CANCEL: 'databricks.sql.cancel',

  // Delta operations
  DELTA_READ: 'databricks.delta.read',
  DELTA_WRITE: 'databricks.delta.write',
  DELTA_MERGE: 'databricks.delta.merge',
  DELTA_DELETE: 'databricks.delta.delete',
  DELTA_UPDATE: 'databricks.delta.update',
  DELTA_OPTIMIZE: 'databricks.delta.optimize',
  DELTA_VACUUM: 'databricks.delta.vacuum',

  // Catalog operations
  CATALOG_LIST: 'databricks.catalog.list',
  CATALOG_GET: 'databricks.catalog.get',

  // API operations
  API_REQUEST: 'databricks.api.request',
} as const;

// ============================================================================
// Databricks-specific Metrics
// ============================================================================

/**
 * Metric names for Databricks operations
 */
export const DatabricksMetrics = {
  // Job metrics
  JOBS_SUBMITTED_TOTAL: 'databricks_jobs_submitted_total',
  JOB_DURATION_SECONDS: 'databricks_job_duration_seconds',

  // SQL metrics
  SQL_QUERIES_TOTAL: 'databricks_sql_queries_total',
  SQL_QUERY_DURATION_SECONDS: 'databricks_sql_query_duration_seconds',
  SQL_ROWS_RETURNED: 'databricks_sql_rows_returned',

  // Delta metrics
  DELTA_OPERATIONS_TOTAL: 'databricks_delta_operations_total',
  DELTA_ROWS_PROCESSED: 'databricks_delta_rows_processed',
  DELTA_BYTES_PROCESSED: 'databricks_delta_bytes_processed',

  // API metrics
  API_REQUESTS_TOTAL: 'databricks_api_requests_total',
  RATE_LIMITS_TOTAL: 'databricks_rate_limits_total',
  ERRORS_TOTAL: 'databricks_errors_total',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper to create job span attributes
 */
export function createJobSpanAttributes(params: {
  jobType?: string;
  clusterId?: string;
  notebookPath?: string;
  runId?: string;
  state?: string;
  duration?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (params.jobType) attrs.job_type = params.jobType;
  if (params.clusterId) attrs.cluster_id = params.clusterId;
  if (params.notebookPath) attrs.notebook_path = params.notebookPath;
  if (params.runId) attrs.run_id = params.runId;
  if (params.state) attrs.state = params.state;
  if (params.duration !== undefined) attrs.duration = params.duration;
  return attrs;
}

/**
 * Helper to create SQL span attributes
 */
export function createSqlSpanAttributes(params: {
  warehouseId?: string;
  statementHash?: string;
  statementId?: string;
  chunkIndex?: number;
  rowCount?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (params.warehouseId) attrs.warehouse_id = params.warehouseId;
  if (params.statementHash) attrs.statement_hash = params.statementHash;
  if (params.statementId) attrs.statement_id = params.statementId;
  if (params.chunkIndex !== undefined) attrs.chunk_index = params.chunkIndex;
  if (params.rowCount !== undefined) attrs.row_count = params.rowCount;
  return attrs;
}

/**
 * Helper to create Delta span attributes
 */
export function createDeltaSpanAttributes(params: {
  table?: string;
  version?: number;
  rowsRead?: number;
  operation?: string;
  rowsWritten?: number;
  matched?: number;
  notMatched?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (params.table) attrs.table = params.table;
  if (params.version !== undefined) attrs.version = params.version;
  if (params.rowsRead !== undefined) attrs.rows_read = params.rowsRead;
  if (params.operation) attrs.operation = params.operation;
  if (params.rowsWritten !== undefined) attrs.rows_written = params.rowsWritten;
  if (params.matched !== undefined) attrs.matched = params.matched;
  if (params.notMatched !== undefined) attrs.not_matched = params.notMatched;
  return attrs;
}

/**
 * Helper to create API span attributes
 */
export function createApiSpanAttributes(params: {
  endpoint?: string;
  method?: string;
  statusCode?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (params.endpoint) attrs.endpoint = params.endpoint;
  if (params.method) attrs.method = params.method;
  if (params.statusCode !== undefined) attrs.status_code = params.statusCode;
  return attrs;
}
