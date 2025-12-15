/**
 * Query Service Types
 *
 * Types specific to BigQuery query operations.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableSchema } from "../../types/schema.js";
import { TableRow } from "../../types/row.js";

/**
 * Dataset reference.
 */
export interface DatasetReference {
  /** Project ID (defaults to config project if not specified). */
  projectId?: string;
  /** Dataset ID. */
  datasetId: string;
}

/**
 * Job reference.
 */
export interface JobReference {
  /** Project ID. */
  projectId: string;
  /** Job ID. */
  jobId: string;
  /** Job location. */
  location?: string;
}

/**
 * Table reference.
 */
export interface TableReference {
  /** Project ID (defaults to config project if not specified). */
  projectId?: string;
  /** Dataset ID. */
  datasetId: string;
  /** Table ID. */
  tableId: string;
}

/**
 * Query priority.
 */
export type QueryPriority = "INTERACTIVE" | "BATCH";

/**
 * Parameter mode for query parameters.
 */
export type ParameterMode = "POSITIONAL" | "NAMED";

/**
 * Query parameter value.
 */
export interface QueryParameterValue {
  /** Parameter type. */
  type: string;
  /** Parameter value. */
  value: unknown;
}

/**
 * Query parameters (named or positional).
 */
export type QueryParameters =
  | { mode: "NAMED"; parameters: Record<string, QueryParameterValue> }
  | { mode: "POSITIONAL"; parameters: QueryParameterValue[] };

/**
 * Query request.
 */
export interface QueryRequest {
  /** SQL query string. */
  query: string;

  /** Default dataset for unqualified table references. */
  defaultDataset?: DatasetReference;

  /** Use legacy SQL (default: false). */
  useLegacySql?: boolean;

  /** Maximum bytes that will be billed for this query. */
  maximumBytesBilled?: bigint;

  /** Query timeout in milliseconds. */
  timeoutMs?: number;

  /** If true, don't actually run the query (just estimate cost). */
  dryRun?: boolean;

  /** Use cached results if available (default: true). */
  useQueryCache?: boolean;

  /** Query parameters (for parameterized queries). */
  queryParameters?: QueryParameters;

  /** Job labels. */
  labels?: Record<string, string>;

  /** Query priority (INTERACTIVE or BATCH). */
  priority?: QueryPriority;

  /** Maximum results to return in first page. */
  maxResults?: number;
}

/**
 * Query response.
 */
export interface QueryResponse {
  /** Job reference for this query. */
  jobReference: JobReference;

  /** Result schema. */
  schema?: TableSchema;

  /** Result rows. */
  rows: TableRow[];

  /** Total number of rows in result set. */
  totalRows?: bigint;

  /** Page token for next page of results. */
  pageToken?: string;

  /** Whether query results were served from cache. */
  cacheHit: boolean;

  /** Total bytes processed by the query. */
  totalBytesProcessed?: bigint;

  /** Total bytes billed for the query. */
  totalBytesBilled?: bigint;

  /** Whether the job is complete. */
  jobComplete: boolean;

  /** Number of DML rows affected (for DML queries). */
  numDmlAffectedRows?: bigint;
}

/**
 * Job status.
 */
export interface Job {
  /** Job reference. */
  jobReference: JobReference;

  /** Job status. */
  status: {
    /** State (PENDING, RUNNING, DONE). */
    state: string;
    /** Error details if job failed. */
    errorResult?: {
      reason: string;
      location?: string;
      message: string;
    };
    /** All errors encountered. */
    errors?: Array<{
      reason: string;
      location?: string;
      message: string;
    }>;
  };

  /** Job configuration. */
  configuration: {
    /** Query configuration if this is a query job. */
    query?: {
      query: string;
      destinationTable?: TableReference;
      useLegacySql?: boolean;
      priority?: string;
    };
  };

  /** Job statistics. */
  statistics?: {
    /** Creation time. */
    creationTime?: string;
    /** Start time. */
    startTime?: string;
    /** End time. */
    endTime?: string;
    /** Total bytes processed. */
    totalBytesProcessed?: string;
    /** Total bytes billed. */
    totalBytesBilled?: string;
    /** Query statistics. */
    query?: {
      totalBytesProcessed?: string;
      totalBytesBilled?: string;
      cacheHit?: boolean;
      billingTier?: number;
    };
  };
}

/**
 * Cost estimate from dry-run.
 */
export interface CostEstimate {
  /** Total bytes that will be processed. */
  totalBytesProcessed: bigint;

  /** Total bytes that will be billed. */
  totalBytesBilled: bigint;

  /** Estimated cost in USD (based on on-demand pricing). */
  estimatedCostUsd: number;

  /** Whether the query would hit cache. */
  cacheHit: boolean;

  /** Result schema. */
  schema?: TableSchema;
}

/**
 * Options for getting query results.
 */
export interface GetQueryResultsOptions {
  /** Maximum results to return. */
  maxResults?: number;

  /** Page token for pagination. */
  pageToken?: string;

  /** Timeout in milliseconds. */
  timeoutMs?: number;

  /** Zero-based start index. */
  startIndex?: bigint;
}
