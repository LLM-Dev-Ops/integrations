/**
 * Request Types for Google Cloud Logging
 *
 * Following the SPARC specification.
 */

import type { LogEntry, MonitoredResource } from "./common.js";

/**
 * Request to write log entries.
 */
export interface WriteLogEntriesRequest {
  /** Log name for entries that do not specify one. */
  logName?: string;
  /** Resource for entries that do not specify one. */
  resource?: MonitoredResource;
  /** Labels to apply to entries that do not specify them. */
  labels?: Record<string, string>;
  /** Log entries to write. */
  entries: LogEntry[];
  /** Whether to allow partial success. */
  partialSuccess?: boolean;
  /** If true, the request should expect a normal response, but the entries won't be persisted. */
  dryRun?: boolean;
}

/**
 * Request to list log entries.
 */
export interface ListLogEntriesRequest {
  /** Required. Names of projects, organizations, folders, or billing accounts to list entries for. */
  resourceNames: string[];
  /** Optional. Filter expression. */
  filter?: string;
  /** Optional. Order by expression. Default: "timestamp desc". */
  orderBy?: string;
  /** Optional. Maximum number of entries to return. Max 1000. */
  pageSize?: number;
  /** Optional. Pagination token. */
  pageToken?: string;
}

/**
 * Request to tail log entries (streaming).
 */
export interface TailLogEntriesRequest {
  /** Required. Names of resources to tail. */
  resourceNames: string[];
  /** Optional. Filter expression. */
  filter?: string;
  /** Optional. Buffer window duration in seconds. */
  bufferWindow?: number;
}

/**
 * Tail request for the LogTailer (alias for TailLogEntriesRequest).
 */
export interface TailRequest {
  /** Resource names to tail. */
  resourceNames: string[];
  /** Filter expression. */
  filter?: string;
  /** Buffer window in seconds. */
  bufferWindow?: number;
}

/**
 * Query request for the LogQuerier.
 */
export interface QueryRequest {
  /** Resource names to query. */
  resourceNames: string[];
  /** Filter expression. */
  filter?: string;
  /** Start time for query (ISO 8601). */
  startTime?: string;
  /** End time for query (ISO 8601). */
  endTime?: string;
  /** Order by expression. */
  orderBy?: string;
  /** Page size (max 1000). */
  pageSize?: number;
  /** Pagination token. */
  pageToken?: string;
}

/**
 * Correlation query options.
 */
export interface CorrelationOptions {
  /** Resource names to query across. */
  resources?: string[];
  /** Start time for correlation query. */
  startTime?: Date;
  /** End time for correlation query. */
  endTime?: Date;
  /** Whether to include child spans. */
  includeChildren?: boolean;
}

/**
 * Request to list logs.
 */
export interface ListLogsRequest {
  /** Required. Resource name (project, folder, organization, or billing account). */
  parent: string;
  /** Optional. Maximum number of results to return. */
  pageSize?: number;
  /** Optional. Pagination token. */
  pageToken?: string;
  /** Optional. Resource names to restrict to. */
  resourceNames?: string[];
}

/**
 * Request to list sinks.
 */
export interface ListSinksRequest {
  /** Required. Parent resource name. */
  parent: string;
  /** Optional. Maximum number of results. */
  pageSize?: number;
  /** Optional. Pagination token. */
  pageToken?: string;
}

/**
 * Request to get a sink.
 */
export interface GetSinkRequest {
  /** Required. Sink resource name. */
  sinkName: string;
}

/**
 * Request to list log-based metrics.
 */
export interface ListMetricsRequest {
  /** Required. Parent resource name. */
  parent: string;
  /** Optional. Maximum number of results. */
  pageSize?: number;
  /** Optional. Pagination token. */
  pageToken?: string;
}

/**
 * Request to get a log-based metric.
 */
export interface GetMetricRequest {
  /** Required. Metric resource name. */
  metricName: string;
}
