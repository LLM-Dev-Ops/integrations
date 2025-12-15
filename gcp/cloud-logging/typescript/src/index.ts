/**
 * Google Cloud Logging Integration Module
 *
 * A thin adapter layer for Google Cloud Logging operations.
 * Following the SPARC specification.
 *
 * @packageDocumentation
 */

// Client exports
export {
  GclClient,
  GclClientImpl,
  GclClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv,
  LogWriter,
  LogEntryBuilder,
  LogQuerier,
  FilterBuilder,
  LogTailer,
  TailStream,
  TailHandle,
  GcpAuthProvider,
  createAuthProvider,
} from "./client/index.js";

// Configuration exports
export {
  GclConfig,
  GcpCredentials,
  ServiceAccountKey,
  RetryConfig,
  CircuitBreakerConfig,
  BufferConfig,
  MonitoredResourceConfig,
  GclConfigBuilder,
  configBuilder,
  resolveEndpoint,
  formatLogName,
  formatResourceName,
  validateLogId,
  DEFAULT_CONFIG,
  DEFAULT_BUFFER_CONFIG,
} from "./config/index.js";

// Type exports
export {
  // Common types
  Severity,
  SeverityString,
  parseSeverity,
  severityToString,
  MonitoredResource,
  globalResource,
  gceInstanceResource,
  k8sContainerResource,
  cloudRunRevisionResource,
  SourceLocation,
  LogEntryOperation,
  HttpRequest,
  LogEntry,
  createLogEntry,
  // Request types
  WriteLogEntriesRequest,
  ListLogEntriesRequest,
  TailLogEntriesRequest,
  QueryRequest,
  CorrelationOptions,
  ListLogsRequest,
  ListSinksRequest,
  GetSinkRequest,
  ListMetricsRequest,
  GetMetricRequest,
  // Response types
  WriteLogEntriesResponse,
  ListLogEntriesResponse,
  QueryResponse,
  BatchWriteResult,
  TailLogEntriesResponse,
  SuppressionInfo,
  ListLogsResponse,
  LogSink,
  ListSinksResponse,
  LogMetric,
  ListMetricsResponse,
  CorrelatedLogs,
  SpanNode,
} from "./types/index.js";

// Error exports
export {
  GclError,
  ConfigurationError,
  AuthenticationError,
  WriteError,
  QueryError,
  NetworkError,
  ServerError,
  parseGclError,
  isRetryableError,
} from "./error/index.js";

// Correlation exports
export {
  TraceContext,
  setTraceContext,
  getTraceContext,
  withTraceContext,
  formatTraceId,
  parseTraceId,
  generateInsertId,
  enrichWithTraceContext,
  buildSpanTree,
  extractServices,
  parseTraceparent,
  formatTraceparent,
  parseCloudTraceContext,
  formatCloudTraceContext,
} from "./correlation/index.js";

// Buffer exports
export { LogBuffer, chunkEntries, createBuffer } from "./buffer/index.js";

// Transport exports
export {
  HttpRequest as TransportHttpRequest,
  HttpResponse,
  HttpTransport,
  StreamingHttpResponse,
  FetchTransport,
  isSuccess,
  getHeader,
  getRequestId,
  getContentLength,
  createRequest,
  createTransport,
} from "./transport/index.js";
