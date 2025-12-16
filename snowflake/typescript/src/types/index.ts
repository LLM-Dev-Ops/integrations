/**
 * Snowflake Integration Types
 *
 * Core type definitions for the Snowflake integration module.
 * @module @llmdevops/snowflake-integration/types
 */

// ============================================================================
// Data Types
// ============================================================================

/**
 * Snowflake data types supported by the integration.
 */
export type SnowflakeDataType =
  | 'NUMBER'
  | 'DECIMAL'
  | 'NUMERIC'
  | 'INT'
  | 'INTEGER'
  | 'BIGINT'
  | 'SMALLINT'
  | 'TINYINT'
  | 'BYTEINT'
  | 'FLOAT'
  | 'FLOAT4'
  | 'FLOAT8'
  | 'DOUBLE'
  | 'DOUBLE PRECISION'
  | 'REAL'
  | 'VARCHAR'
  | 'CHAR'
  | 'CHARACTER'
  | 'STRING'
  | 'TEXT'
  | 'BINARY'
  | 'VARBINARY'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'TIME'
  | 'TIMESTAMP'
  | 'TIMESTAMP_LTZ'
  | 'TIMESTAMP_NTZ'
  | 'TIMESTAMP_TZ'
  | 'VARIANT'
  | 'OBJECT'
  | 'ARRAY'
  | 'GEOGRAPHY'
  | 'GEOMETRY';

/**
 * Value type that can be used in queries.
 */
export type Value =
  | { type: 'null' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'bigint'; value: bigint }
  | { type: 'string'; value: string }
  | { type: 'binary'; value: Uint8Array }
  | { type: 'date'; value: Date }
  | { type: 'timestamp'; value: Date }
  | { type: 'variant'; value: unknown }
  | { type: 'array'; value: unknown[] }
  | { type: 'object'; value: Record<string, unknown> };

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
 * Creates a variant value.
 */
export function variantValue(value: unknown): Value {
  return { type: 'variant', value };
}

/**
 * Creates an array value.
 */
export function arrayValue(value: unknown[]): Value {
  return { type: 'array', value };
}

/**
 * Creates an object value.
 */
export function objectValue(value: Record<string, unknown>): Value {
  return { type: 'object', value };
}

/**
 * Extracts the raw value from a Value type.
 */
export function extractValue(value: Value): unknown {
  if (value.type === 'null') {
    return null;
  }
  return value.value;
}

/**
 * Converts an unknown value to a Value type.
 */
export function toValue(v: unknown): Value {
  if (v === null || v === undefined) {
    return nullValue();
  }
  if (typeof v === 'boolean') {
    return booleanValue(v);
  }
  if (typeof v === 'number') {
    return numberValue(v);
  }
  if (typeof v === 'bigint') {
    return bigintValue(v);
  }
  if (typeof v === 'string') {
    return stringValue(v);
  }
  if (v instanceof Uint8Array) {
    return binaryValue(v);
  }
  if (v instanceof Date) {
    return timestampValue(v);
  }
  if (Array.isArray(v)) {
    return arrayValue(v);
  }
  if (typeof v === 'object') {
    return objectValue(v as Record<string, unknown>);
  }
  return variantValue(v);
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
  /** Database name */
  database?: string;
  /** Schema name */
  schema?: string;
  /** Table name */
  table?: string;
  /** Snowflake data type */
  type: SnowflakeDataType;
  /** Whether the column is nullable */
  nullable: boolean;
  /** Precision for numeric types */
  precision?: number;
  /** Scale for numeric types */
  scale?: number;
  /** Length for string types */
  length?: number;
  /** Byte length for string/binary types */
  byteLength?: number;
  /** Collation for string types */
  collation?: string;
}

// ============================================================================
// Row Type
// ============================================================================

/**
 * A single row from query results.
 */
export interface Row {
  /** Values by column index */
  values: Value[];
  /** Get value by column name or index */
  get<T = unknown>(key: string | number): T | undefined;
  /** Get value as string */
  getString(key: string | number): string | null;
  /** Get value as number */
  getNumber(key: string | number): number | null;
  /** Get value as boolean */
  getBoolean(key: string | number): boolean | null;
  /** Get value as Date */
  getDate(key: string | number): Date | null;
  /** Get value as object (for VARIANT/OBJECT types) */
  getObject<T = Record<string, unknown>>(key: string | number): T | null;
  /** Get value as array (for ARRAY types) */
  getArray<T = unknown>(key: string | number): T[] | null;
}

/**
 * Creates a Row from raw data and column metadata.
 */
export function createRow(
  data: Record<string, unknown>,
  columns: ColumnMetadata[]
): Row {
  const values = columns.map((col) => toValue(data[col.name]));
  const columnIndex = new Map(columns.map((col, i) => [col.name.toUpperCase(), i]));

  const getValue = (key: string | number): Value | undefined => {
    if (typeof key === 'number') {
      return values[key];
    }
    const idx = columnIndex.get(key.toUpperCase());
    return idx !== undefined ? values[idx] : undefined;
  };

  return {
    values,
    get<T = unknown>(key: string | number): T | undefined {
      const v = getValue(key);
      return v ? (extractValue(v) as T) : undefined;
    },
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
      if (typeof raw === 'string') return raw.toLowerCase() === 'true';
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
    getArray<T = unknown>(key: string | number): T[] | null {
      const v = getValue(key);
      if (!v || v.type === 'null') return null;
      const raw = extractValue(v);
      if (Array.isArray(raw)) return raw as T[];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed as T[] : null;
        } catch {
          return null;
        }
      }
      return null;
    },
  };
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
  /** Whether there are more rows to fetch */
  hasMore: boolean;
  /** Last evaluated position for pagination */
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
  /** Compilation time in milliseconds */
  compilationTimeMs?: number;
  /** Queued time in milliseconds */
  queuedTimeMs?: number;
  /** Number of rows produced */
  rowsProduced: number;
  /** Number of rows affected (for DML) */
  rowsAffected?: number;
  /** Bytes scanned */
  bytesScanned: number;
  /** Bytes written */
  bytesWritten?: number;
  /** Bytes sent over network */
  bytesSent?: number;
  /** Number of partitions scanned */
  partitionsScanned?: number;
  /** Total number of partitions */
  partitionsTotal?: number;
  /** Percentage of data scanned from cache */
  percentScannedFromCache?: number;
}

// ============================================================================
// Query Result
// ============================================================================

/**
 * Complete query result with metadata.
 */
export interface QueryResult {
  /** Unique query ID */
  queryId: string;
  /** SQL statement hash */
  statementHash?: string;
  /** Result set */
  resultSet: ResultSet;
  /** Query statistics */
  statistics: QueryStatistics;
  /** Warehouse used */
  warehouse?: string;
  /** Session ID */
  sessionId?: string;
}

// ============================================================================
// Query Status
// ============================================================================

/**
 * Status of an async query.
 */
export type QueryStatus =
  | { status: 'queued' }
  | { status: 'running'; progress?: number }
  | { status: 'success'; result: QueryResult }
  | { status: 'failed'; error: Error; errorCode?: string }
  | { status: 'cancelled' };

/**
 * Status check for async queries.
 */
export interface AsyncQueryStatus {
  /** Query ID */
  queryId: string;
  /** Current status */
  status: QueryStatus;
  /** SQL text */
  sqlText?: string;
  /** Start time */
  startTime?: Date;
  /** End time (if completed) */
  endTime?: Date;
}

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
  /** Current warehouse */
  warehouse?: string;
  /** Current role */
  role?: string;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
  /** Number of queries executed */
  queryCount: number;
}

// ============================================================================
// Warehouse Types
// ============================================================================

/**
 * Warehouse size.
 */
export type WarehouseSize =
  | 'X-Small'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'X-Large'
  | '2X-Large'
  | '3X-Large'
  | '4X-Large'
  | '5X-Large'
  | '6X-Large';

/**
 * Warehouse state.
 */
export type WarehouseState = 'started' | 'suspended' | 'resizing';

/**
 * Warehouse status information.
 */
export interface WarehouseStatus {
  /** Warehouse name */
  name: string;
  /** Current state */
  state: WarehouseState;
  /** Warehouse size */
  size: WarehouseSize;
  /** Current cluster count */
  clusterCount: number;
  /** Minimum cluster count */
  minClusterCount: number;
  /** Maximum cluster count */
  maxClusterCount: number;
  /** Number of queued queries */
  queuedQueries: number;
  /** Number of running queries */
  runningQueries: number;
  /** Auto-suspend time in seconds */
  autoSuspendSeconds: number;
  /** Whether auto-resume is enabled */
  autoResume: boolean;
  /** Credits used in current period */
  creditsUsed?: number;
}

/**
 * Workload type for warehouse routing.
 */
export type WorkloadType =
  | 'interactive'
  | 'batch'
  | 'analytics'
  | 'data-science'
  | 'etl'
  | 'reporting';

// ============================================================================
// Cost Types
// ============================================================================

/**
 * Credit usage record.
 */
export interface CreditUsage {
  /** Date of usage */
  date: Date;
  /** Warehouse name */
  warehouse: string;
  /** Credits consumed */
  creditsUsed: number;
  /** Credits allocated */
  creditsAllocated?: number;
  /** Compute credits */
  computeCredits?: number;
  /** Cloud services credits */
  cloudServicesCredits?: number;
}

/**
 * Cost estimate for a query.
 */
export interface CostEstimate {
  /** Estimated credits */
  estimatedCredits: number;
  /** Estimated partitions to scan */
  partitionsToScan: number;
  /** Total partitions */
  partitionsTotal: number;
  /** Estimated bytes to scan */
  bytesToScan: number;
  /** Estimated execution time in seconds */
  estimatedTimeSeconds?: number;
  /** Confidence level of estimate */
  confidence: 'low' | 'medium' | 'high';
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Database information.
 */
export interface DatabaseInfo {
  /** Database name */
  name: string;
  /** Owner */
  owner?: string;
  /** Comment/description */
  comment?: string;
  /** Creation timestamp */
  createdAt?: Date;
  /** Retention time in days */
  retentionTime?: number;
  /** Is transient */
  isTransient?: boolean;
  /** Is default */
  isDefault?: boolean;
}

/**
 * Schema information.
 */
export interface SchemaInfo {
  /** Schema name */
  name: string;
  /** Database name */
  database: string;
  /** Owner */
  owner?: string;
  /** Comment/description */
  comment?: string;
  /** Creation timestamp */
  createdAt?: Date;
  /** Retention time in days */
  retentionTime?: number;
  /** Is transient */
  isTransient?: boolean;
  /** Is managed access */
  isManagedAccess?: boolean;
}

/**
 * Table information.
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Database name */
  database: string;
  /** Schema name */
  schema: string;
  /** Table type (BASE TABLE, VIEW, etc.) */
  tableType: string;
  /** Owner */
  owner?: string;
  /** Comment/description */
  comment?: string;
  /** Row count (approximate) */
  rowCount?: number;
  /** Size in bytes */
  bytes?: number;
  /** Cluster keys */
  clusterBy?: string[];
  /** Creation timestamp */
  createdAt?: Date;
  /** Last altered timestamp */
  lastAlteredAt?: Date;
  /** Is external */
  isExternal?: boolean;
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
  dataType: SnowflakeDataType;
  /** Is nullable */
  isNullable: boolean;
  /** Default value */
  defaultValue?: string;
  /** Comment */
  comment?: string;
  /** Is primary key */
  isPrimaryKey?: boolean;
  /** Is unique */
  isUnique?: boolean;
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
  /** Query type */
  queryType: string;
  /** Database used */
  database?: string;
  /** Schema used */
  schema?: string;
  /** Warehouse used */
  warehouse?: string;
  /** User who ran the query */
  user?: string;
  /** Role used */
  role?: string;
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
  /** Bytes scanned */
  bytesScanned?: number;
  /** Credits used */
  creditsUsed?: number;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

// ============================================================================
// Ingestion Types
// ============================================================================

/**
 * Stage file information.
 */
export interface StageFile {
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** MD5 hash */
  md5?: string;
  /** Last modified time */
  lastModified?: Date;
}

/**
 * File format type.
 */
export type FormatType = 'CSV' | 'JSON' | 'AVRO' | 'ORC' | 'PARQUET' | 'XML';

/**
 * File format specification.
 */
export interface FileFormat {
  /** Format type */
  formatType: FormatType;
  /** Compression type */
  compression?: 'AUTO' | 'GZIP' | 'BZ2' | 'BROTLI' | 'ZSTD' | 'DEFLATE' | 'RAW_DEFLATE' | 'NONE';
  /** Skip header rows (CSV) */
  skipHeader?: number;
  /** Field delimiter (CSV) */
  fieldDelimiter?: string;
  /** Record delimiter */
  recordDelimiter?: string;
  /** Field optionally enclosed by (CSV) */
  fieldOptionallyEnclosedBy?: string;
  /** NULL if values */
  nullIf?: string[];
  /** Empty field as null */
  emptyFieldAsNull?: boolean;
  /** Skip blank lines */
  skipBlankLines?: boolean;
  /** Date format */
  dateFormat?: string;
  /** Time format */
  timeFormat?: string;
  /** Timestamp format */
  timestampFormat?: string;
  /** Binary format */
  binaryFormat?: 'HEX' | 'BASE64' | 'UTF8';
  /** Escape character */
  escape?: string;
  /** Escape unenclosed field */
  escapeUnenclosedField?: string;
  /** Trim space */
  trimSpace?: boolean;
  /** Error on column count mismatch (CSV) */
  errorOnColumnCountMismatch?: boolean;
  /** Strip outer array (JSON) */
  stripOuterArray?: boolean;
  /** Strip null values (JSON) */
  stripNullValues?: boolean;
  /** Enable octal (JSON) */
  enableOctal?: boolean;
  /** Allow duplicate (JSON) */
  allowDuplicate?: boolean;
}

/**
 * Copy options for COPY INTO operations.
 */
export interface CopyOptions {
  /** On error behavior */
  onError?: 'CONTINUE' | 'SKIP_FILE' | 'SKIP_FILE_<num>' | 'ABORT_STATEMENT';
  /** Size limit in bytes */
  sizeLimit?: number;
  /** Purge files after loading */
  purge?: boolean;
  /** Return failed only */
  returnFailedOnly?: boolean;
  /** Match by column name */
  matchByColumnName?: 'CASE_SENSITIVE' | 'CASE_INSENSITIVE' | 'NONE';
  /** Enforce length */
  enforceLength?: boolean;
  /** Truncate columns */
  truncateColumns?: boolean;
  /** Force */
  force?: boolean;
}

/**
 * PUT operation options.
 */
export interface PutOptions {
  /** Auto compress */
  autoCompress?: boolean;
  /** Source compression */
  sourceCompression?: 'AUTO_DETECT' | 'GZIP' | 'BZ2' | 'BROTLI' | 'ZSTD' | 'DEFLATE' | 'RAW_DEFLATE' | 'NONE';
  /** Parallel uploads */
  parallel?: number;
  /** Overwrite existing files */
  overwrite?: boolean;
}

/**
 * PUT operation result.
 */
export interface PutResult {
  /** Source file name */
  sourceFileName: string;
  /** Target file name */
  targetFileName: string;
  /** Source file size */
  sourceSize: number;
  /** Target file size */
  targetSize: number;
  /** Source compression */
  sourceCompression: string;
  /** Target compression */
  targetCompression: string;
  /** Status */
  status: 'UPLOADED' | 'SKIPPED';
  /** Message */
  message?: string;
}

/**
 * COPY INTO request.
 */
export interface CopyIntoRequest {
  /** Target table */
  targetTable: string;
  /** Stage location */
  stage: string;
  /** File pattern */
  filePattern?: string;
  /** Specific files */
  files?: string[];
  /** File format */
  fileFormat?: FileFormat;
  /** Copy options */
  copyOptions?: CopyOptions;
  /** Column mapping */
  columnMapping?: Record<string, string>;
  /** Transformation select */
  transformationSelect?: string;
}

/**
 * COPY INTO result.
 */
export interface CopyIntoResult {
  /** Total rows loaded */
  rowsLoaded: number;
  /** Files processed */
  filesProcessed: number;
  /** Individual file results */
  fileResults: Array<{
    fileName: string;
    status: 'LOADED' | 'LOAD_FAILED' | 'PARTIALLY_LOADED';
    rowsParsed: number;
    rowsLoaded: number;
    errorsSeen: number;
    firstError?: string;
    firstErrorLine?: number;
    firstErrorCharacter?: number;
  }>;
  /** Errors encountered */
  errors?: string[];
}

/**
 * Bulk insert options.
 */
export interface BulkInsertOptions {
  /** Batch size */
  batchSize?: number;
  /** On error behavior */
  onError?: 'CONTINUE' | 'ABORT';
  /** Use staging */
  useStaging?: boolean;
  /** Target file format (when using staging) */
  fileFormat?: FileFormat;
}

// ============================================================================
// Health Types
// ============================================================================

/**
 * Health check result.
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;
  /** Snowflake connectivity */
  snowflakeReachable: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Current warehouse state */
  warehouseState?: WarehouseState;
  /** Session count */
  activeSessions?: number;
  /** Error message if unhealthy */
  error?: string;
}

// ============================================================================
// Simulation Types
// ============================================================================

/**
 * Simulation mode.
 */
export type SimulationMode = 'disabled' | 'record' | 'replay';

/**
 * Recorded query for simulation.
 */
export interface RecordedQuery {
  /** Query fingerprint */
  fingerprint: string;
  /** SQL text */
  sqlText: string;
  /** Parameters */
  params?: Value[];
  /** Response */
  response: QueryResult | Error;
  /** Timestamp */
  timestamp: Date;
  /** Duration in milliseconds */
  durationMs: number;
}
