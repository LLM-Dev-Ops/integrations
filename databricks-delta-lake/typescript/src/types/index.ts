/**
 * Databricks Delta Lake Integration Types
 *
 * Core type definitions for the Databricks Delta Lake integration module.
 * @module @llmdevops/databricks-delta-lake-integration/types
 */

// ============================================================================
// API Version
// ============================================================================

/**
 * Databricks REST API version.
 */
export type ApiVersion = '2.1' | '2.0';

// ============================================================================
// Job Types
// ============================================================================

/**
 * Job task types supported by Databricks.
 */
export type JobTask =
  | NotebookTask
  | SparkJarTask
  | SparkPythonTask
  | SparkSubmitTask;

/**
 * Notebook task configuration.
 */
export interface NotebookTask {
  type: 'notebook';
  /** Path to the notebook in the workspace */
  notebookPath: string;
  /** Base parameters for the notebook */
  baseParameters?: Record<string, string>;
  /** Source of the notebook (WORKSPACE or GIT) */
  source?: 'WORKSPACE' | 'GIT';
}

/**
 * Spark JAR task configuration.
 */
export interface SparkJarTask {
  type: 'spark_jar';
  /** Main class name to execute */
  mainClassName: string;
  /** URI of the JAR file */
  jarUri: string;
  /** Parameters to pass to the main class */
  parameters?: string[];
}

/**
 * Spark Python task configuration.
 */
export interface SparkPythonTask {
  type: 'spark_python';
  /** Python file to execute */
  pythonFile: string;
  /** Parameters to pass to the Python script */
  parameters?: string[];
  /** Python source type */
  source?: 'WORKSPACE' | 'GIT';
}

/**
 * Spark Submit task configuration.
 */
export interface SparkSubmitTask {
  type: 'spark_submit';
  /** Parameters to pass to spark-submit */
  parameters: string[];
}

/**
 * Autoscale configuration for clusters.
 */
export interface AutoscaleConfig {
  /** Minimum number of workers */
  minWorkers: number;
  /** Maximum number of workers */
  maxWorkers: number;
}

/**
 * Cluster specification for job execution.
 */
export interface ClusterSpec {
  /** Spark version (e.g., "13.3.x-scala2.12") */
  sparkVersion: string;
  /** Node type ID (e.g., "Standard_DS3_v2") */
  nodeTypeId: string;
  /** Number of workers (0 if using autoscale) */
  numWorkers?: number;
  /** Autoscale configuration */
  autoscale?: AutoscaleConfig;
  /** Spark configuration parameters */
  sparkConf?: Record<string, string>;
  /** Spark environment variables */
  sparkEnvVars?: Record<string, string>;
  /** Custom tags for the cluster */
  customTags?: Record<string, string>;
  /** Driver node type ID */
  driverNodeTypeId?: string;
  /** Whether to enable autoscaling local storage */
  enableElasticDisk?: boolean;
  /** Init scripts */
  initScripts?: Array<{ dbfs?: string; s3?: string; workspace?: string }>;
}

/**
 * Run ID for tracking job execution.
 */
export interface RunId {
  value: number;
}

/**
 * Run state enumeration.
 */
export type RunLifeCycleState =
  | 'PENDING'
  | 'RUNNING'
  | 'TERMINATING'
  | 'TERMINATED'
  | 'SKIPPED'
  | 'INTERNAL_ERROR';

/**
 * Result state for terminated runs.
 */
export type ResultState =
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELED'
  | 'TIMEDOUT';

/**
 * Run state information.
 */
export interface RunState {
  /** Life cycle state */
  lifeCycleState: RunLifeCycleState;
  /** Result state (only for TERMINATED state) */
  resultState?: ResultState;
  /** State message */
  stateMessage?: string;
  /** User-visible state message */
  userCancelledOrTimedout?: boolean;
}

/**
 * Run status information.
 */
export interface RunStatus {
  /** Run ID */
  runId: RunId;
  /** Current state */
  state: RunState;
  /** Start time (epoch milliseconds) */
  startTime?: number;
  /** Setup duration (milliseconds) */
  setupDuration?: number;
  /** Execution duration (milliseconds) */
  executionDuration?: number;
  /** Cleanup duration (milliseconds) */
  cleanupDuration?: number;
  /** End time (epoch milliseconds) */
  endTime?: number;
  /** Cluster instance information */
  clusterInstance?: {
    clusterId: string;
    sparkContextId: string;
  };
  /** Task states */
  tasks?: Array<{
    taskKey: string;
    state: RunState;
    startTime?: number;
    endTime?: number;
  }>;
}

/**
 * Run output from completed job.
 */
export interface RunOutput {
  /** Notebook output (for notebook tasks) */
  notebookOutput?: {
    result?: string;
    truncated?: boolean;
  };
  /** SQL output (for SQL tasks) */
  sqlOutput?: {
    queryOutput?: {
      outputLink?: string;
      warehouseId?: string;
    };
  };
  /** DLT output (for DLT tasks) */
  dbtOutput?: {
    artifactsLink?: string;
  };
  /** Logs */
  logs?: string;
  /** Logs truncated flag */
  logsTruncated?: boolean;
  /** Error information */
  error?: string;
  /** Error trace */
  errorTrace?: string;
  /** Metadata */
  metadata?: {
    jobId?: number;
    runId?: number;
    numberOfBytesCompleted?: number;
  };
}

/**
 * Configuration for waiting on job completion.
 */
export interface WaitConfig {
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Maximum wait time in milliseconds */
  timeoutMs: number;
}

// ============================================================================
// SQL Types
// ============================================================================

/**
 * SQL statement state.
 */
export type StatementState =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'CLOSED';

/**
 * Column information from SQL results.
 */
export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Type name (e.g., "INT", "STRING") */
  typeName: string;
  /** Full type text with precision/scale */
  typeText: string;
  /** Position in the result set */
  position?: number;
}

/**
 * Row data from SQL results.
 */
export type Row = Array<unknown>;

/**
 * SQL statement result.
 */
export interface StatementResult {
  /** Unique statement ID */
  statementId: string;
  /** Result schema */
  schema: ColumnInfo[];
  /** Result rows */
  rows: Row[];
  /** Total row count */
  totalRowCount?: number;
  /** Chunk count for pagination */
  chunkCount?: number;
  /** Next chunk index */
  nextChunkIndex?: number;
  /** Bytes processed */
  bytesProcessed?: number;
  /** Row offset */
  rowOffset?: number;
}

/**
 * Statement status information.
 */
export interface StatementStatus {
  /** Statement ID */
  statementId: string;
  /** Current state */
  state: StatementState;
  /** Error information if failed */
  error?: {
    errorCode?: string;
    message: string;
  };
}

// ============================================================================
// Delta Lake Types
// ============================================================================

/**
 * Options for reading Delta tables.
 */
export interface ReadOptions {
  /** Columns to select (undefined = all columns) */
  columns?: string[];
  /** WHERE clause filter */
  filter?: string;
  /** Table version to read */
  version?: number;
  /** Timestamp for time travel */
  timestamp?: string;
  /** Row limit */
  limit?: number;
}

/**
 * Write mode for Delta operations.
 */
export type WriteMode =
  | 'append'
  | 'overwrite'
  | 'error_if_exists';

/**
 * Write operation result.
 */
export interface WriteResult {
  /** Number of rows affected */
  rowsAffected: number;
  /** Number of partitions written */
  partitionsWritten?: number;
  /** Bytes written */
  bytesWritten?: number;
  /** Files written */
  filesWritten?: number;
}

/**
 * Merge operation action.
 */
export type MergeAction =
  | { type: 'update'; set?: Record<string, string> }
  | { type: 'delete' }
  | { type: 'insert'; values?: Record<string, string> };

/**
 * Merge operation result.
 */
export interface MergeResult {
  /** Number of rows matched */
  rowsMatched: number;
  /** Number of rows inserted */
  rowsInserted: number;
  /** Number of rows updated */
  rowsUpdated?: number;
  /** Number of rows deleted */
  rowsDeleted: number;
}

/**
 * Delta table history entry.
 */
export interface HistoryEntry {
  /** Table version */
  version: number;
  /** Timestamp of the operation */
  timestamp: string;
  /** User who performed the operation */
  userId?: string;
  /** User name */
  userName?: string;
  /** Operation type (e.g., WRITE, MERGE, DELETE) */
  operation: string;
  /** Operation parameters */
  operationParameters?: Record<string, unknown>;
  /** Operation metrics */
  operationMetrics?: Record<string, number>;
  /** Notebook information */
  notebook?: {
    notebookId?: string;
  };
  /** Cluster ID */
  clusterId?: string;
  /** Read version */
  readVersion?: number;
  /** Isolation level */
  isolationLevel?: string;
  /** Is blind append */
  isBlindAppend?: boolean;
}

/**
 * Optimize operation options.
 */
export interface OptimizeOptions {
  /** WHERE clause to optimize specific partitions */
  whereClause?: string;
  /** Columns for Z-ordering */
  zorderColumns?: string[];
}

/**
 * Optimize operation result.
 */
export interface OptimizeResult {
  /** Number of files removed */
  filesRemoved: number;
  /** Number of files added */
  filesAdded: number;
  /** Bytes removed */
  bytesRemoved: number;
  /** Bytes added */
  bytesAdded: number;
  /** Number of partitions optimized */
  partitionsOptimized?: number;
  /** Z-order statistics */
  zOrderStats?: Record<string, unknown>;
}

/**
 * Vacuum operation result.
 */
export interface VacuumResult {
  /** Number of files deleted */
  filesDeleted: number;
  /** Bytes freed */
  bytesFreed: number;
}

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Column schema definition.
 */
export interface ColumnSchema {
  /** Column name */
  name: string;
  /** Data type */
  dataType: string;
  /** Whether the column is nullable */
  nullable: boolean;
  /** Column comment/description */
  comment?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Table schema definition.
 */
export interface TableSchema {
  /** Column definitions */
  columns: ColumnSchema[];
}

/**
 * Schema compatibility result.
 */
export type SchemaCompatibility =
  | { type: 'identical' }
  | { type: 'evolution'; newColumns: ColumnSchema[] }
  | { type: 'incompatible'; reason: string };

// ============================================================================
// Catalog Types
// ============================================================================

/**
 * Catalog information from Unity Catalog.
 */
export interface CatalogInfo {
  /** Catalog name */
  name: string;
  /** Comment/description */
  comment?: string;
  /** Owner */
  owner?: string;
  /** Creation timestamp (epoch milliseconds) */
  createdAt?: number;
  /** Last modified timestamp (epoch milliseconds) */
  updatedAt?: number;
  /** Metastore ID */
  metastoreId?: string;
}

/**
 * Schema information from Unity Catalog.
 */
export interface SchemaInfo {
  /** Schema name */
  name: string;
  /** Catalog name */
  catalogName: string;
  /** Full name (catalog.schema) */
  fullName?: string;
  /** Comment/description */
  comment?: string;
  /** Owner */
  owner?: string;
  /** Creation timestamp (epoch milliseconds) */
  createdAt?: number;
  /** Last modified timestamp (epoch milliseconds) */
  updatedAt?: number;
  /** Properties */
  properties?: Record<string, string>;
}

/**
 * Table type in Unity Catalog.
 */
export type TableType =
  | 'MANAGED'
  | 'EXTERNAL'
  | 'VIEW'
  | 'MATERIALIZED_VIEW'
  | 'STREAMING_TABLE';

/**
 * Table information from Unity Catalog.
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Catalog name */
  catalogName: string;
  /** Schema name */
  schemaName: string;
  /** Full name (catalog.schema.table) */
  fullName: string;
  /** Table type */
  tableType: TableType;
  /** Data source format (e.g., "DELTA") */
  dataSourceFormat?: string;
  /** Column definitions */
  columns?: ColumnSchema[];
  /** Storage location */
  storageLocation?: string;
  /** Comment/description */
  comment?: string;
  /** Owner */
  owner?: string;
  /** Creation timestamp (epoch milliseconds) */
  createdAt?: number;
  /** Last modified timestamp (epoch milliseconds) */
  updatedAt?: number;
  /** Table properties */
  properties?: Record<string, string>;
  /** View definition (for views) */
  viewDefinition?: string;
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * Stream source types.
 */
export type StreamSource =
  | { type: 'delta'; table: string }
  | { type: 'kafka'; bootstrapServers: string; topic: string; options?: Record<string, string> }
  | { type: 'rate'; rowsPerSecond?: number }
  | { type: 'cloudFiles'; path: string; format: string; options?: Record<string, string> };

/**
 * Stream sink types.
 */
export type StreamSink =
  | { type: 'delta'; table: string; outputMode?: 'append' | 'complete' | 'update' }
  | { type: 'kafka'; bootstrapServers: string; topic: string }
  | { type: 'console'; outputMode?: 'append' | 'complete' | 'update' };

/**
 * Trigger mode for streaming jobs.
 */
export type TriggerMode =
  | { type: 'processing_time'; intervalMs: number }
  | { type: 'once' }
  | { type: 'available_now' }
  | { type: 'continuous'; checkpointIntervalMs: number };

/**
 * Streaming job specification.
 */
export interface StreamingJobSpec {
  /** Stream source */
  source: StreamSource;
  /** Stream sink */
  sink: StreamSink;
  /** Trigger mode */
  trigger: TriggerMode;
  /** Checkpoint location */
  checkpointLocation: string;
  /** Query name */
  queryName?: string;
  /** Transformations (SQL) */
  transformations?: string[];
  /** Options */
  options?: Record<string, string>;
}

/**
 * Streaming query status.
 */
export interface StreamingQueryStatus {
  /** Query ID */
  queryId: string;
  /** Query name */
  queryName?: string;
  /** Is active */
  isActive: boolean;
  /** Current status message */
  statusMessage?: string;
  /** Recent progress */
  recentProgress?: Array<{
    timestamp: string;
    batchId: number;
    numInputRows: number;
    inputRowsPerSecond?: number;
    processedRowsPerSecond?: number;
    durationMs?: number;
  }>;
}

// ============================================================================
// Common Types
// ============================================================================

/**
 * Usage information for cost tracking.
 */
export interface Usage {
  /** DBUs consumed */
  dbus: number;
  /** Duration in seconds */
  durationSeconds: number;
  /** Cluster type */
  clusterType?: string;
  /** Instance type */
  instanceType?: string;
}

/**
 * Metrics for observability.
 */
export interface Metrics {
  /** Number of requests */
  requestCount: number;
  /** Error count */
  errorCount: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** P95 latency in milliseconds */
  p95LatencyMs?: number;
  /** P99 latency in milliseconds */
  p99LatencyMs?: number;
  /** Throughput (requests per second) */
  throughput?: number;
}

/**
 * List parameters for pagination.
 */
export interface ListParams {
  /** Maximum number of items to return */
  maxResults?: number;
  /** Page token for pagination */
  pageToken?: string;
}

/**
 * List response with pagination.
 */
export interface ListResponse<T> {
  /** Items in the current page */
  items: T[];
  /** Token for the next page */
  nextPageToken?: string;
  /** Whether there are more items */
  hasMore: boolean;
  /** Total count (if available) */
  totalCount?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Authentication configuration.
 */
export type AuthConfig =
  | { type: 'pat'; token: string }
  | { type: 'oauth'; clientId: string; clientSecret: string; scopes?: string[] }
  | { type: 'service_principal'; tenantId: string; clientId: string; clientSecret: string }
  | { type: 'azure_ad'; tenantId: string; clientId: string };

/**
 * Databricks client configuration.
 */
export interface DatabricksConfig {
  /** Workspace URL */
  workspaceUrl: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Rate limit (requests per second) */
  rateLimit?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  /** Circuit breaker configuration */
  circuitBreaker?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error code enumeration.
 */
export type ErrorCode =
  | 'INVALID_STATE'
  | 'RESOURCE_DOES_NOT_EXIST'
  | 'PERMISSION_DENIED'
  | 'INVALID_PARAMETER_VALUE'
  | 'RESOURCE_CONFLICT'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'REQUEST_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'FEATURE_DISABLED'
  | 'CUSTOMER_UNAUTHORIZED'
  | 'OPERATION_NOT_ALLOWED';

/**
 * Databricks error response.
 */
export interface DatabricksError {
  /** Error code */
  errorCode: ErrorCode;
  /** Error message */
  message: string;
  /** Additional details */
  details?: unknown;
  /** HTTP status code */
  statusCode?: number;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Represents a secret string that should not be logged.
 */
export interface SecretString {
  value: string;
  expose(): string;
}

/**
 * Creates a secret string.
 */
export function createSecretString(value: string): SecretString {
  return {
    value: '[REDACTED]',
    expose(): string {
      return value;
    },
  };
}

/**
 * Time unit for durations.
 */
export type TimeUnit = 'ms' | 's' | 'm' | 'h' | 'd';

/**
 * Duration specification.
 */
export interface Duration {
  value: number;
  unit: TimeUnit;
}

/**
 * Converts duration to milliseconds.
 */
export function toMilliseconds(duration: Duration): number {
  switch (duration.unit) {
    case 'ms':
      return duration.value;
    case 's':
      return duration.value * 1000;
    case 'm':
      return duration.value * 60 * 1000;
    case 'h':
      return duration.value * 60 * 60 * 1000;
    case 'd':
      return duration.value * 24 * 60 * 60 * 1000;
  }
}

/**
 * Pagination cursor for result sets.
 */
export interface PaginationCursor {
  /** Page token */
  token: string;
  /** Offset */
  offset?: number;
  /** Limit */
  limit?: number;
}
