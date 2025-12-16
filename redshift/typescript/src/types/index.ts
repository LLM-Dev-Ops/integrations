/**
 * Redshift Integration Types
 *
 * Core type definitions for the Redshift integration module.
 * @module @llmdevops/redshift-integration/types
 */

// ============================================================================
// Data Types
// ============================================================================

/**
 * Redshift data types (based on PostgreSQL types with Redshift extensions).
 */
export type RedshiftDataType =
  // Numeric types
  | 'SMALLINT'
  | 'INT2'
  | 'INTEGER'
  | 'INT'
  | 'INT4'
  | 'BIGINT'
  | 'INT8'
  | 'DECIMAL'
  | 'NUMERIC'
  | 'REAL'
  | 'FLOAT4'
  | 'DOUBLE PRECISION'
  | 'FLOAT8'
  | 'FLOAT'
  // Character types
  | 'CHAR'
  | 'CHARACTER'
  | 'NCHAR'
  | 'BPCHAR'
  | 'VARCHAR'
  | 'CHARACTER VARYING'
  | 'NVARCHAR'
  | 'TEXT'
  // Boolean types
  | 'BOOLEAN'
  | 'BOOL'
  // Date/time types
  | 'DATE'
  | 'TIMESTAMP'
  | 'TIMESTAMP WITHOUT TIME ZONE'
  | 'TIMESTAMPTZ'
  | 'TIMESTAMP WITH TIME ZONE'
  // Binary types
  | 'BYTEA'
  | 'VARBYTE'
  // Semi-structured types
  | 'SUPER'
  | 'JSON'
  | 'JSONB'
  // Spatial types
  | 'GEOMETRY'
  | 'GEOGRAPHY'
  // Other types
  | 'HLLSKETCH'
  | 'UUID'
  | 'UNKNOWN';

/**
 * Typed value container.
 */
export type Value =
  | { type: 'null' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'bigint'; value: bigint }
  | { type: 'string'; value: string }
  | { type: 'date'; value: Date }
  | { type: 'timestamp'; value: Date }
  | { type: 'binary'; value: Uint8Array }
  | { type: 'json'; value: unknown }
  | { type: 'super'; value: unknown }
  | { type: 'geometry'; value: unknown }
  | { type: 'geography'; value: unknown }
  | { type: 'uuid'; value: string }
  | { type: 'hllsketch'; value: Uint8Array };

/**
 * Row data with typed accessors.
 */
export interface Row {
  /** Column values in order */
  values: Value[];
  /** Get value by column index */
  get(index: number): Value;
  /** Get value by column name */
  getByName(name: string, columns: ColumnMetadata[]): Value;
  /** Convert row to plain object */
  toObject(columns: ColumnMetadata[]): Record<string, unknown>;
}

// ============================================================================
// Column Metadata
// ============================================================================

/**
 * Column metadata from query results.
 */
export interface ColumnMetadata {
  /** Column name */
  name: string;
  /** Redshift data type */
  type: RedshiftDataType;
  /** Data type OID */
  dataTypeID: number;
  /** Table OID */
  tableID?: number;
  /** Column attribute number */
  columnID?: number;
  /** Data type modifier */
  dataTypeModifier?: number;
  /** Data type size */
  dataTypeSize?: number;
  /** Format code */
  format?: string;
  /** Is nullable */
  nullable?: boolean;
  /** Precision (for numeric/decimal types) */
  precision?: number;
  /** Scale (for numeric/decimal types) */
  scale?: number;
  /** Maximum length (for character types) */
  length?: number;
  /** Database name */
  database?: string;
  /** Schema name */
  schema?: string;
  /** Table name */
  table?: string;
}

// ============================================================================
// Result Set
// ============================================================================

/**
 * Query result set.
 */
export interface ResultSet {
  /** Column metadata */
  columns: ColumnMetadata[];
  /** Rows of data */
  rows: Row[];
  /** Total row count */
  rowCount: number;
  /** Command type (SELECT, INSERT, etc.) */
  command?: string;
  /** OID (for INSERT operations) */
  oid?: number;
  /** Whether there are more results available */
  hasMore?: boolean;
  /** Cursor position for pagination */
  lastPosition?: string;
}

// ============================================================================
// Query Statistics
// ============================================================================

/**
 * Statistics from query execution.
 */
export interface QueryStatistics {
  /** Query execution time in milliseconds */
  executionTimeMs: number;
  /** Number of rows returned */
  rowsReturned: number;
  /** Number of rows affected (for DML) */
  rowsAffected?: number;
  /** Bytes scanned */
  bytesScanned?: number;
  /** Bytes returned */
  bytesReturned?: number;
  /** Query queue time in milliseconds */
  queuedTimeMs?: number;
  /** Compilation time in milliseconds */
  compilationTimeMs?: number;
}

// ============================================================================
// Query Result
// ============================================================================

/**
 * Complete query result with metadata.
 */
export interface QueryResult {
  /** Unique query ID (process ID) */
  queryId: string;
  /** SQL text that was executed */
  sqlText?: string;
  /** Result set */
  resultSet: ResultSet;
  /** Query statistics */
  statistics: QueryStatistics;
  /** Session ID */
  sessionId?: string;
  /** Query group (for WLM routing) */
  queryGroup?: string;
}

// ============================================================================
// Query Status
// ============================================================================

/**
 * Status of an async query.
 */
export type QueryStatus =
  | { status: 'queued'; position?: number }
  | { status: 'running'; progress?: number; elapsedMs?: number }
  | { status: 'success'; result: QueryResult }
  | { status: 'failed'; error: Error; errorCode?: string }
  | { status: 'cancelled' };

/**
 * Status check for async queries.
 */
export interface AsyncQueryStatus {
  /** Query ID (process ID) */
  queryId: string;
  /** Current status */
  status: QueryStatus;
  /** SQL text */
  sqlText?: string;
  /** Start time */
  startTime?: Date;
  /** End time (if completed) */
  endTime?: Date;
  /** Database name */
  database?: string;
  /** Username */
  username?: string;
}

// ============================================================================
// Simulation Types
// ============================================================================

/**
 * Simulation mode.
 */
export type SimulationMode = 'disabled' | 'record' | 'replay';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts the raw value from a Value object.
 */
export function extractValue(value: Value): unknown {
  return value.type === 'null' ? null : value.value;
}

/**
 * Creates a Value object from a raw value.
 */
export function toValue(rawValue: unknown, dataType?: RedshiftDataType): Value {
  if (rawValue === null || rawValue === undefined) {
    return { type: 'null' };
  }

  if (typeof rawValue === 'boolean') {
    return { type: 'boolean', value: rawValue };
  }

  if (typeof rawValue === 'number') {
    return { type: 'number', value: rawValue };
  }

  if (typeof rawValue === 'bigint') {
    return { type: 'bigint', value: rawValue };
  }

  if (typeof rawValue === 'string') {
    return { type: 'string', value: rawValue };
  }

  if (rawValue instanceof Date) {
    // Determine if it's a date or timestamp based on dataType
    if (dataType === 'DATE') {
      return { type: 'date', value: rawValue };
    }
    return { type: 'timestamp', value: rawValue };
  }

  if (rawValue instanceof Uint8Array || rawValue instanceof Buffer) {
    return { type: 'binary', value: rawValue instanceof Buffer ? new Uint8Array(rawValue) : rawValue };
  }

  // Default to string for unknown types
  return { type: 'string', value: String(rawValue) };
}

/**
 * Creates a Row object from raw data.
 */
export function createRow(data: Record<string, unknown>, columns: ColumnMetadata[]): Row {
  const values: Value[] = columns.map((col) => {
    const rawValue = data[col.name];
    return toValue(rawValue, col.type);
  });

  return {
    values,
    get(index: number): Value {
      return values[index] ?? { type: 'null' };
    },
    getByName(name: string, cols: ColumnMetadata[]): Value {
      const index = cols.findIndex((c) => c.name === name);
      return index >= 0 ? values[index]! : { type: 'null' };
    },
    toObject(cols: ColumnMetadata[]): Record<string, unknown> {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]!.name] = extractValue(values[i]!);
      }
      return obj;
    },
  };
}

/**
 * Recorded query for simulation.
 */
export interface RecordedQuery {
  /** Query fingerprint */
  fingerprint: string;
  /** SQL text */
  sqlText: string;
  /** Parameters */
  params?: unknown[];
  /** Response */
  response: QueryResult | Error;
  /** Timestamp */
  timestamp: Date;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Value Factory Functions
// ============================================================================

/**
 * Creates a null value.
 */
export function nullValue(): Value {
  return { type: 'null' };
}

/**
 * Creates a boolean value.
 */
export function booleanValue(value: boolean): Value {
  return { type: 'boolean', value };
}

/**
 * Creates a number value.
 */
export function numberValue(value: number): Value {
  return { type: 'number', value };
}

/**
 * Creates a bigint value.
 */
export function bigintValue(value: bigint): Value {
  return { type: 'bigint', value };
}

/**
 * Creates a string value.
 */
export function stringValue(value: string): Value {
  return { type: 'string', value };
}

/**
 * Creates a binary value.
 */
export function binaryValue(value: Uint8Array): Value {
  return { type: 'binary', value };
}

/**
 * Creates a date value.
 */
export function dateValue(value: Date): Value {
  return { type: 'date', value };
}

/**
 * Creates a timestamp value.
 */
export function timestampValue(value: Date): Value {
  return { type: 'timestamp', value };
}

/**
 * Creates a timestamptz value.
 */
export function timestamptzValue(value: Date): Value {
  return { type: 'timestamp', value }; // Redshift handles TZ internally
}

/**
 * Creates a time value.
 */
export function timeValue(value: string): Value {
  return { type: 'string', value };
}

/**
 * Creates an interval value.
 */
export function intervalValue(value: string): Value {
  return { type: 'string', value };
}

/**
 * Creates a SUPER value (JSON/semi-structured data).
 */
export function superValue(value: unknown): Value {
  return { type: 'super', value };
}

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Query parameter for prepared statements.
 */
export type QueryParam = Value;

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session state.
 */
export type SessionState = 'idle' | 'active' | 'closing' | 'closed' | 'error';

/**
 * Session information.
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** Current state */
  state: SessionState;
  /** Current database */
  database?: string;
  /** Current schema */
  schema?: string;
  /** Current user */
  user?: string;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
  /** Number of queries executed */
  queryCount: number;
}

// ============================================================================
// Workload Management (WLM) Types
// ============================================================================

/**
 * WLM queue configuration.
 */
export interface WlmQueue {
  /** Queue name */
  name: string;
  /** Number of query slots */
  slots: number;
  /** Memory percentage */
  memoryPct: number;
  /** Query timeout in milliseconds */
  timeoutMs: number;
  /** Associated query group */
  queryGroup?: string;
  /** Associated user groups */
  userGroups?: string[];
}

/**
 * Current state of a WLM queue.
 */
export interface QueueState {
  /** Queue configuration */
  queue: WlmQueue;
  /** Number of running queries */
  runningQueries: number;
  /** Number of queued queries */
  queuedQueries: number;
  /** Available slots */
  availableSlots: number;
}

/**
 * Information about a running query.
 */
export interface RunningQuery {
  /** Query ID */
  queryId: string;
  /** Process ID */
  pid: number;
  /** User executing the query */
  user: string;
  /** Database */
  database: string;
  /** Query start time */
  startTime: Date;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Query state */
  state: string;
  /** Query text (may be truncated) */
  queryText: string;
  /** WLM queue */
  queue: string;
}

// ============================================================================
// Data Loading Types (COPY)
// ============================================================================

/**
 * Source for COPY command.
 */
export type CopySource =
  | { type: 's3'; bucket: string; prefix: string; manifest?: boolean; region?: string }
  | { type: 'dynamodb'; tableName: string; readRatio?: number };

/**
 * Data format for COPY/UNLOAD operations.
 */
export type DataFormat =
  | { type: 'csv'; delimiter?: string; quote?: string; escape?: string; header?: boolean }
  | { type: 'json'; jsonPaths?: string; auto?: boolean }
  | { type: 'parquet' }
  | { type: 'orc' }
  | { type: 'avro' };

/**
 * Compression type for data files.
 */
export type Compression = 'none' | 'gzip' | 'lzop' | 'bzip2' | 'zstd';

/**
 * Options for COPY command.
 */
export interface CopyOptions {
  /** IAM role ARN for S3 access */
  iamRole: string;
  /** AWS region */
  region?: string;
  /** Compression type */
  compression?: Compression;
  /** Maximum number of errors allowed */
  maxErrors?: number;
  /** Truncate columns that exceed length */
  truncateColumns?: boolean;
  /** Treat blank values as NULL */
  blankAsNull?: boolean;
  /** Treat empty values as NULL */
  emptyAsNull?: boolean;
  /** Date format string */
  dateFormat?: string;
  /** Time format string */
  timeFormat?: string;
  /** Character to replace invalid characters */
  acceptInvChars?: string;
}

/**
 * COPY command specification.
 */
export interface CopyCommand {
  /** Target table reference */
  table: TableRef;
  /** Data source */
  source: CopySource;
  /** Data format */
  format: DataFormat;
  /** Copy options */
  options: CopyOptions;
}

/**
 * Result of a COPY operation.
 */
export interface CopyResult {
  /** Number of rows loaded */
  rowsLoaded: number;
  /** Number of errors encountered */
  errors: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Bytes scanned from source */
  bytesScanned: number;
}

/**
 * Error from data loading operation.
 */
export interface LoadError {
  /** Line number in source file */
  lineNumber: number;
  /** Column name if applicable */
  columnName?: string;
  /** Error code */
  errorCode: number;
  /** Error message */
  errorMessage: string;
  /** Raw value that caused the error */
  rawValue?: string;
  /** Source file name */
  fileName?: string;
}

// ============================================================================
// Data Unloading Types (UNLOAD)
// ============================================================================

/**
 * Format for UNLOAD command.
 */
export type UnloadFormat =
  | { type: 'csv'; delimiter?: string; header?: boolean }
  | { type: 'parquet'; compression?: 'none' | 'snappy' | 'gzip' | 'zstd' }
  | { type: 'json' };

/**
 * Options for UNLOAD command.
 */
export interface UnloadOptions {
  /** IAM role ARN for S3 access */
  iamRole: string;
  /** Enable parallel unload */
  parallel?: boolean;
  /** Maximum file size in MB */
  maxFileSizeMb?: number;
  /** Create manifest file */
  manifest?: boolean;
  /** Encrypt files */
  encrypted?: boolean;
  /** KMS key ID for encryption */
  kmsKeyId?: string;
  /** Partition columns */
  partitionBy?: string[];
  /** Allow overwriting existing files */
  allowOverwrite?: boolean;
}

/**
 * UNLOAD command specification.
 */
export interface UnloadCommand {
  /** Query to unload results from */
  query: string;
  /** S3 destination */
  destination: { bucket: string; prefix: string };
  /** Output format */
  format: UnloadFormat;
  /** Unload options */
  options: UnloadOptions;
}

/**
 * Result of an UNLOAD operation.
 */
export interface UnloadResult {
  /** Number of files created */
  filesCreated: number;
  /** Number of rows unloaded */
  rowsUnloaded: number;
  /** Bytes written to S3 */
  bytesWritten: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Manifest file path if created */
  manifestPath?: string;
}

// ============================================================================
// Spectrum (Federated Query) Types
// ============================================================================

/**
 * External catalog type.
 */
export type ExternalCatalog =
  | { type: 'glue'; database: string; region: string }
  | { type: 'hive'; uri: string };

/**
 * External schema for Redshift Spectrum.
 */
export interface ExternalSchema {
  /** Schema name */
  name: string;
  /** Database name */
  database: string;
  /** External catalog */
  catalog: ExternalCatalog;
}

/**
 * Partition column definition.
 */
export interface PartitionColumn {
  /** Column name */
  name: string;
  /** Data type */
  dataType: RedshiftDataType;
}

/**
 * External table definition.
 */
export interface ExternalTable {
  /** Schema name */
  schema: string;
  /** Table name */
  name: string;
  /** S3 location */
  location: string;
  /** Data format */
  format: DataFormat;
  /** Column definitions */
  columns: ColumnMetadata[];
  /** Partition columns */
  partitions: PartitionColumn[];
}

// ============================================================================
// Table Reference
// ============================================================================

/**
 * Reference to a table in Redshift.
 */
export interface TableRef {
  /** Database name */
  database?: string;
  /** Schema name */
  schema?: string;
  /** Table name */
  table: string;
}

/**
 * Formats a table reference as a fully qualified name.
 */
export function formatTableRef(ref: TableRef): string {
  const parts: string[] = [];
  if (ref.database) parts.push(ref.database);
  if (ref.schema) parts.push(ref.schema);
  parts.push(ref.table);
  return parts.join('.');
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health check result.
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;
  /** Redshift cluster reachable */
  redshiftReachable: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Number of active connections */
  activeConnections?: number;
  /** Number of running queries */
  runningQueries?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of check */
  checkedAt: Date;
}

// ============================================================================
// AsyncQueryHandle Type
// ============================================================================

/**
 * Async query handle for tracking query execution.
 */
export interface AsyncQueryHandle {
  /** Query ID */
  queryId: string;
  /** Current status */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Submission timestamp */
  submittedAt: Date;
  /** Progress percentage (0-100) if running */
  progress?: number;
  /** Result if completed */
  result?: QueryResult;
  /** Error if failed */
  error?: Error;
}

// ============================================================================
// Row Helper Methods
// ============================================================================

/**
 * Enhanced row interface with convenient accessor methods.
 */
export interface RowWithAccessors extends Row {
  /** Get value as string */
  getString(key: string | number): string | null;
  /** Get value as number */
  getNumber(key: string | number): number | null;
  /** Get value as boolean */
  getBoolean(key: string | number): boolean | null;
  /** Get value as Date */
  getDate(key: string | number): Date | null;
  /** Get value as object (for SUPER types) */
  getObject<T = Record<string, unknown>>(key: string | number): T | null;
}

/**
 * Creates a Row with enhanced accessor methods.
 */
export function createRowWithAccessors(
  data: Record<string, unknown>,
  columns: ColumnMetadata[]
): RowWithAccessors {
  const baseRow = createRow(data, columns);
  const columnIndex = new Map(columns.map((col, i) => [col.name.toUpperCase(), i]));

  const getValue = (key: string | number): Value | undefined => {
    if (typeof key === 'number') {
      return baseRow.values[key];
    }
    const idx = columnIndex.get(key.toUpperCase());
    return idx !== undefined ? baseRow.values[idx] : undefined;
  };

  return {
    ...baseRow,
    getString(key: string | number): string | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      return String(extractValue(v));
    },
    getNumber(key: string | number): number | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      const raw = extractValue(v);
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'bigint') return Number(raw);
      if (typeof raw === 'string') return parseFloat(raw);
      return null;
    },
    getBoolean(key: string | number): boolean | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      const raw = extractValue(v);
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return raw !== 0;
      if (typeof raw === 'string') {
        const lower = raw.toLowerCase();
        if (lower === 'true' || lower === 't' || lower === '1') return true;
        if (lower === 'false' || lower === 'f' || lower === '0') return false;
      }
      return null;
    },
    getDate(key: string | number): Date | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      const raw = extractValue(v);
      if (raw instanceof Date) return raw;
      if (typeof raw === 'string' || typeof raw === 'number') {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    },
    getObject<T = Record<string, unknown>>(key: string | number): T | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      const raw = extractValue(v);
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        return raw as T;
      }
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
      return null;
    },
  };
}

// ============================================================================
// Query Options Types
// ============================================================================

/**
 * Options for query execution.
 */
export interface QueryOptions {
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Query tag for tracking */
  tag?: string;
  /** Query group for WLM routing */
  queryGroup?: string;
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction isolation level.
 */
export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

/**
 * Transaction options.
 */
export interface TransactionOptions {
  /** Isolation level */
  isolationLevel?: IsolationLevel;
  /** Read only transaction */
  readOnly?: boolean;
}

/**
 * Transaction interface.
 */
export interface Transaction {
  /** Transaction ID */
  transactionId: string;
  /** Execute a query within the transaction */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** Commit the transaction */
  commit(): Promise<void>;
  /** Rollback the transaction */
  rollback(): Promise<void>;
  /** Check if transaction is active */
  isActive(): boolean;
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Schema information.
 */
export interface SchemaInfo {
  /** Schema name */
  name: string;
  /** Database name */
  database?: string;
  /** Owner */
  owner?: string;
  /** Schema type */
  type?: string;
}

/**
 * Table information.
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Schema name */
  schema: string;
  /** Database name */
  database?: string;
  /** Table type (table, view, etc.) */
  tableType: string;
  /** Owner */
  owner?: string;
  /** Row count (approximate) */
  rowCount?: number;
  /** Size in bytes */
  bytes?: number;
}

/**
 * Column information.
 */
export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Ordinal position */
  ordinalPosition: number;
  /** Data type */
  dataType: RedshiftDataType;
  /** Is nullable */
  isNullable: boolean;
  /** Default value */
  defaultValue?: string;
  /** Character maximum length */
  characterMaxLength?: number;
  /** Numeric precision */
  numericPrecision?: number;
  /** Numeric scale */
  numericScale?: number;
}

/**
 * Query history entry.
 */
export interface QueryHistoryEntry {
  /** Query ID */
  queryId: string;
  /** SQL text */
  queryText: string;
  /** User who ran the query */
  user?: string;
  /** Database used */
  database?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Execution status */
  status: 'running' | 'success' | 'failed' | 'cancelled';
  /** Error message if failed */
  errorMessage?: string;
  /** Rows produced */
  rowsProduced?: number;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

// ============================================================================
// Cluster Status Types
// ============================================================================

/**
 * Cluster status information.
 */
export interface ClusterStatus {
  /** Cluster identifier */
  clusterIdentifier: string;
  /** Cluster status */
  clusterStatus: string;
  /** Node type */
  nodeType: string;
  /** Number of nodes */
  numberOfNodes: number;
  /** Database name */
  databaseName?: string;
  /** Availability zone */
  availabilityZone?: string;
}

// ============================================================================
// Bulk Insert Types
// ============================================================================

/**
 * Bulk insert result.
 */
export interface BulkInsertResult {
  /** Rows inserted */
  rowsInserted: number;
  /** Errors encountered */
  errors?: string[];
}

// ============================================================================
// Spectrum (External Schema/Table) Types
// ============================================================================

/**
 * External schema information (Spectrum).
 */
export interface ExternalSchemaInfo {
  /** Schema name */
  name: string;
  /** External database name */
  databaseName: string;
  /** IAM role ARN */
  iamRole?: string;
}

/**
 * External table information (Spectrum).
 */
export interface ExternalTableInfo {
  /** Table name */
  name: string;
  /** Schema name */
  schema: string;
  /** S3 location */
  location: string;
  /** Input format */
  inputFormat?: string;
  /** Output format */
  outputFormat?: string;
  /** Compression type */
  compression?: string;
}
