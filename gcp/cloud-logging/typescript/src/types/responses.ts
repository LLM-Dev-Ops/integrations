/**
 * Response Types for Google Cloud Logging
 *
 * Following the SPARC specification.
 */

import type { LogEntry } from "./common.js";

/**
 * Response from writing log entries.
 */
export interface WriteLogEntriesResponse {
  // Empty response on success
}

/**
 * Response from listing log entries.
 */
export interface ListLogEntriesResponse {
  /** Log entries returned by the query (API returns raw objects). */
  entries?: Array<Record<string, unknown>>;
  /** Pagination token for next page. */
  nextPageToken?: string;
}

/**
 * Query response for the LogQuerier.
 */
export interface QueryResponse {
  /** Log entries returned. */
  entries: LogEntry[];
  /** Pagination token for next page. */
  nextPageToken?: string;
}

/**
 * Batch write result.
 */
export interface BatchWriteResult {
  /** Number of successfully written entries. */
  successCount: number;
  /** Number of failed entries. */
  failureCount: number;
  /** Details of failures by insert ID. */
  failures: Array<{ insertId: string; error: string }>;
}

/**
 * Response from tailing log entries.
 */
export interface TailLogEntriesResponse {
  /** Log entries received (API returns raw objects). */
  entries?: Array<Record<string, unknown>>;
  /** Information about suppressed entries. */
  suppressionInfo?: SuppressionInfo;
}

/**
 * Information about suppressed log entries during tail.
 */
export interface SuppressionInfo {
  /** Reason for suppression. */
  reason: "RATE_LIMITED" | "NOT_CONSUMED";
  /** Count of suppressed entries. */
  suppressedCount: number;
}

/**
 * Response from listing logs.
 */
export interface ListLogsResponse {
  /** Log names. */
  logNames?: string[];
  /** Pagination token. */
  nextPageToken?: string;
}

/**
 * Log sink configuration (read-only).
 */
export interface LogSink {
  /** Sink name. */
  name: string;
  /** Destination resource. */
  destination: string;
  /** Filter expression. */
  filter?: string;
  /** Description. */
  description?: string;
  /** Whether sink is disabled. */
  disabled?: boolean;
  /** Output version format. */
  outputVersionFormat?: "VERSION_FORMAT_UNSPECIFIED" | "V2" | "V1";
  /** Writer identity. */
  writerIdentity?: string;
  /** Include children. */
  includeChildren?: boolean;
  /** Create time (ISO 8601). */
  createTime?: string;
  /** Update time (ISO 8601). */
  updateTime?: string;
}

/**
 * Response from listing sinks.
 */
export interface ListSinksResponse {
  /** Sinks. */
  sinks?: LogSink[];
  /** Pagination token. */
  nextPageToken?: string;
}

/**
 * Log-based metric (read-only).
 */
export interface LogMetric {
  /** Metric name. */
  name: string;
  /** Description. */
  description?: string;
  /** Filter expression. */
  filter: string;
  /** Metric descriptor. */
  metricDescriptor?: {
    name?: string;
    type?: string;
    labels?: Array<{
      key: string;
      valueType?: string;
      description?: string;
    }>;
    metricKind?: string;
    valueType?: string;
    unit?: string;
    description?: string;
    displayName?: string;
  };
  /** Value extractor. */
  valueExtractor?: string;
  /** Label extractors. */
  labelExtractors?: Record<string, string>;
  /** Bucket options. */
  bucketOptions?: {
    linearBuckets?: {
      numFiniteBuckets: number;
      width: number;
      offset: number;
    };
    exponentialBuckets?: {
      numFiniteBuckets: number;
      growthFactor: number;
      scale: number;
    };
    explicitBuckets?: {
      bounds: number[];
    };
  };
  /** Create time (ISO 8601). */
  createTime?: string;
  /** Update time (ISO 8601). */
  updateTime?: string;
  /** Version. */
  version?: "V2" | "V1";
}

/**
 * Response from listing metrics.
 */
export interface ListMetricsResponse {
  /** Metrics. */
  metrics?: LogMetric[];
  /** Pagination token. */
  nextPageToken?: string;
}

/**
 * Correlated logs result.
 */
export interface CorrelatedLogs {
  /** Trace ID. */
  traceId: string;
  /** All log entries for this trace. */
  entries: LogEntry[];
  /** Span tree structure. */
  spanTree: SpanNode;
  /** Unique services involved. */
  services: string[];
}

/**
 * Span node in the trace tree.
 */
export interface SpanNode {
  /** Span ID. */
  spanId: string;
  /** Service name (if detected). */
  service?: string;
  /** Log entries for this span. */
  entries: LogEntry[];
  /** Child spans. */
  children: SpanNode[];
}
