/**
 * MySQL type definitions following SPARC specification.
 *
 * Core types for database connections, queries, transactions, and routing.
 */

// ============================================================================
// Connection Types
// ============================================================================

/**
 * SSL/TLS connection mode.
 */
export enum SslMode {
  /** No SSL/TLS encryption */
  Disabled = 'disabled',
  /** Prefer SSL/TLS but allow unencrypted if server doesn't support it */
  Preferred = 'preferred',
  /** Require SSL/TLS encryption */
  Required = 'required',
  /** Require SSL/TLS and verify CA certificate */
  VerifyCA = 'verify-ca',
  /** Require SSL/TLS and verify full certificate chain */
  VerifyIdentity = 'verify-identity',
}

/**
 * MySQL connection configuration.
 *
 * SECURITY: password field is marked as sensitive and never logged.
 */
export interface ConnectionConfig {
  /** Database server hostname or IP address */
  host: string;
  /** Database server port (default: 3306) */
  port: number;
  /** Database name to connect to */
  database: string;
  /** Database username */
  username: string;
  /**
   * Database password (SENSITIVE - never logged).
   * @sensitive
   */
  password: string;
  /** SSL/TLS connection mode */
  sslMode: SslMode;
  /** SSL/TLS CA certificate (PEM format) */
  sslCa?: string;
  /** SSL/TLS client certificate (PEM format) */
  sslCert?: string;
  /** SSL/TLS client private key (PEM format) */
  sslKey?: string;
  /** Character set (default: utf8mb4) */
  charset: string;
  /** Collation (default: utf8mb4_unicode_ci) */
  collation: string;
  /** Timezone for connection */
  timezone?: string;
  /** Connection timeout in milliseconds */
  connectTimeoutMs: number;
  /** Read timeout in milliseconds */
  readTimeoutMs?: number;
  /** Write timeout in milliseconds */
  writeTimeoutMs?: number;
}

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Minimum number of idle connections to maintain */
  minConnections: number;
  /** Maximum number of connections in the pool */
  maxConnections: number;
  /** Timeout for acquiring a connection from the pool (ms) */
  acquireTimeoutMs: number;
  /** Time a connection can be idle before being closed (ms) */
  idleTimeoutMs: number;
  /** Maximum lifetime of a connection before rotation (ms) */
  maxLifetimeMs: number;
  /** Interval for health checks on idle connections (ms) */
  validationIntervalMs: number;
  /** Query used to validate connections (default: "SELECT 1") */
  validationQuery: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * MySQL value types.
 */
export type Value =
  | { type: 'Null' }
  | { type: 'Bool'; value: boolean }
  | { type: 'Int'; value: number }
  | { type: 'UInt'; value: number }
  | { type: 'Float'; value: number }
  | { type: 'Double'; value: number }
  | { type: 'String'; value: string }
  | { type: 'Bytes'; value: Uint8Array }
  | { type: 'Date'; value: Date }
  | { type: 'Time'; value: string }
  | { type: 'DateTime'; value: Date }
  | { type: 'Timestamp'; value: number }
  | { type: 'Decimal'; value: string }
  | { type: 'Json'; value: unknown };

/**
 * Database column metadata.
 */
export interface ColumnMetadata {
  /** Column name */
  name: string;
  /** Table name (if available) */
  table?: string;
  /** Database name (if available) */
  database?: string;
  /** MySQL column type */
  columnType: ColumnType;
  /** Column flags */
  flags: ColumnFlags;
  /** Decimal precision */
  decimals: number;
  /** Maximum column length */
  maxLength: number;
}

/**
 * MySQL column types.
 */
export enum ColumnType {
  TinyInt = 'TINYINT',
  SmallInt = 'SMALLINT',
  MediumInt = 'MEDIUMINT',
  Int = 'INT',
  BigInt = 'BIGINT',
  Float = 'FLOAT',
  Double = 'DOUBLE',
  Decimal = 'DECIMAL',
  Char = 'CHAR',
  VarChar = 'VARCHAR',
  Text = 'TEXT',
  MediumText = 'MEDIUMTEXT',
  LongText = 'LONGTEXT',
  Binary = 'BINARY',
  VarBinary = 'VARBINARY',
  Blob = 'BLOB',
  MediumBlob = 'MEDIUMBLOB',
  LongBlob = 'LONGBLOB',
  Date = 'DATE',
  Time = 'TIME',
  DateTime = 'DATETIME',
  Timestamp = 'TIMESTAMP',
  Year = 'YEAR',
  Enum = 'ENUM',
  Set = 'SET',
  Bit = 'BIT',
  Json = 'JSON',
  Geometry = 'GEOMETRY',
}

/**
 * MySQL column flags.
 */
export interface ColumnFlags {
  /** Column is NOT NULL */
  notNull: boolean;
  /** Column is PRIMARY KEY */
  primaryKey: boolean;
  /** Column is UNIQUE KEY */
  uniqueKey: boolean;
  /** Column is MULTIPLE KEY (part of non-unique index) */
  multipleKey: boolean;
  /** Column is BLOB */
  blob: boolean;
  /** Column is UNSIGNED */
  unsigned: boolean;
  /** Column is ZEROFILL */
  zerofill: boolean;
  /** Column is BINARY */
  binary: boolean;
  /** Column is ENUM */
  enum: boolean;
  /** Column is AUTO_INCREMENT */
  autoIncrement: boolean;
  /** Column is TIMESTAMP */
  timestamp: boolean;
  /** Column is SET */
  set: boolean;
}

/**
 * Database row with typed value access.
 */
export interface Row {
  /** Raw values array */
  values: Value[];
  /**
   * Get a value by column index.
   * @param index - Column index (0-based)
   * @returns The value at the specified index
   */
  get(index: number): Value;
}

/**
 * Query execution result set.
 */
export interface ResultSet {
  /** Column metadata */
  columns: ColumnMetadata[];
  /** Result rows */
  rows: Row[];
  /** Number of rows affected by the query */
  affectedRows: number;
  /** Last inserted auto-increment ID */
  lastInsertId?: number;
  /** Number of warnings */
  warnings: number;
}

/**
 * Execute result (for non-SELECT queries).
 */
export interface ExecuteResult {
  /** Number of rows affected */
  affectedRows: number;
  /** Last inserted auto-increment ID */
  lastInsertId?: number;
  /** Number of warnings */
  warnings: number;
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction isolation level.
 */
export enum IsolationLevel {
  /** Lowest isolation level (rarely used) */
  ReadUncommitted = 'READ UNCOMMITTED',
  /** Prevent dirty reads */
  ReadCommitted = 'READ COMMITTED',
  /** Default isolation level in MySQL */
  RepeatableRead = 'REPEATABLE READ',
  /** Highest isolation level, fully serializable */
  Serializable = 'SERIALIZABLE',
}

/**
 * Transaction savepoint.
 */
export interface Savepoint {
  /** Savepoint name */
  name: string;
  /** When the savepoint was created */
  createdAt: Date;
}

/**
 * Transaction options.
 */
export interface TransactionOptions {
  /** Transaction isolation level */
  isolationLevel?: IsolationLevel;
  /** Whether the transaction is read-only */
  readOnly: boolean;
  /** Transaction timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Active database transaction.
 */
export interface Transaction {
  /** Unique transaction identifier */
  id: string;
  /** Transaction isolation level */
  isolationLevel: IsolationLevel;
  /** Whether the transaction is read-only */
  readOnly: boolean;
  /** When the transaction started */
  startedAt: Date;
  /** Active savepoints within this transaction */
  savepoints: Savepoint[];
}

// ============================================================================
// Replica Types
// ============================================================================

/**
 * Load balancing strategy for replica selection.
 */
export enum LoadBalanceStrategy {
  /** Distribute requests in round-robin fashion */
  RoundRobin = 'round-robin',
  /** Route to a random replica */
  Random = 'random',
  /** Route to replica with fewest active connections */
  LeastConnections = 'least-connections',
  /** Weighted round-robin based on replica weights */
  WeightedRoundRobin = 'weighted-round-robin',
}

/**
 * Replica endpoint configuration.
 */
export interface ReplicaEndpoint {
  /** Connection configuration for the replica */
  config: ConnectionConfig;
  /** Weight for weighted load balancing (default: 1) */
  weight: number;
  /** Priority (lower = higher priority, default: 0) */
  priority: number;
}

/**
 * Replica configuration.
 */
export interface ReplicaConfig {
  /** Primary (write) connection configuration */
  primary: ConnectionConfig;
  /** Replica (read) endpoints */
  replicas: ReplicaEndpoint[];
  /** Load balancing strategy */
  loadBalanceStrategy: LoadBalanceStrategy;
  /** Maximum acceptable replica lag in milliseconds */
  maxReplicaLagMs: number;
}

/**
 * Replica health status.
 */
export interface ReplicaStatus {
  /** Replica endpoint identifier */
  endpoint: string;
  /** Seconds behind master (null if not available) */
  secondsBehindMaster?: number;
  /** Whether IO thread is running */
  ioRunning: boolean;
  /** Whether SQL thread is running */
  sqlRunning: boolean;
  /** Last replication error (if any) */
  lastError?: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Column key type.
 */
export enum ColumnKey {
  /** No key */
  None = '',
  /** Primary key */
  Primary = 'PRI',
  /** Unique key */
  Unique = 'UNI',
  /** Multiple (non-unique) key */
  Multiple = 'MUL',
  /** Foreign key */
  ForeignKey = 'FOR',
}

/**
 * Table column information.
 */
export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Ordinal position in table (1-based) */
  ordinalPosition: number;
  /** Default value (if any) */
  default?: string;
  /** Whether the column allows NULL values */
  isNullable: boolean;
  /** Data type (e.g., 'int', 'varchar') */
  dataType: string;
  /** Full column type (e.g., 'int(11)', 'varchar(255)') */
  columnType: string;
  /** Maximum character length (for string types) */
  maxLength?: number;
  /** Numeric precision (for numeric types) */
  numericPrecision?: number;
  /** Numeric scale (for decimal types) */
  numericScale?: number;
  /** Character set name */
  characterSet?: string;
  /** Collation name */
  collation?: string;
  /** Column key type */
  columnKey: ColumnKey;
  /** Extra information (e.g., 'auto_increment') */
  extra: string;
  /** Column comment */
  comment: string;
}

/**
 * Table information from information_schema.
 */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Database name */
  database: string;
  /** Storage engine (e.g., 'InnoDB', 'MyISAM') */
  engine: string;
  /** Row format (e.g., 'Dynamic', 'Compact') */
  rowFormat: string;
  /** Approximate number of rows */
  rows: number;
  /** Average row length in bytes */
  avgRowLength: number;
  /** Data size in bytes */
  dataLength: number;
  /** Index size in bytes */
  indexLength: number;
  /** Next auto_increment value */
  autoIncrement?: number;
  /** Table creation time */
  createTime: Date;
  /** Last update time */
  updateTime?: Date;
  /** Table collation */
  collation: string;
  /** Table comment */
  comment: string;
}

/**
 * MySQL index type.
 */
export enum IndexType {
  /** B-Tree index (default) */
  BTree = 'BTREE',
  /** Hash index */
  Hash = 'HASH',
  /** Full-text index */
  FullText = 'FULLTEXT',
  /** Spatial index */
  Spatial = 'SPATIAL',
}

/**
 * Sort direction for index columns.
 */
export enum SortDirection {
  /** Ascending order */
  Ascending = 'ASC',
  /** Descending order */
  Descending = 'DESC',
}

/**
 * Index column information.
 */
export interface IndexColumn {
  /** Column name */
  name: string;
  /** Ordinal position in index (1-based) */
  ordinal: number;
  /** Sort direction */
  direction: SortDirection;
  /** Number of indexed characters (for string columns) */
  subPart?: number;
}

/**
 * Index information.
 */
export interface IndexInfo {
  /** Index name */
  name: string;
  /** Table name */
  table: string;
  /** Whether the index is unique */
  unique: boolean;
  /** Index type */
  indexType: IndexType;
  /** Columns in the index */
  columns: IndexColumn[];
  /** Index comment */
  comment: string;
}

/**
 * EXPLAIN query access type.
 */
export enum AccessType {
  /** Table has only one row (system table) */
  System = 'system',
  /** Table has at most one row (const) */
  Const = 'const',
  /** One row from each table combination */
  EqRef = 'eq_ref',
  /** All rows with matching index values */
  Ref = 'ref',
  /** Full-text index search */
  FullText = 'fulltext',
  /** Ref or NULL lookup */
  RefOrNull = 'ref_or_null',
  /** Index merge optimization */
  IndexMerge = 'index_merge',
  /** Unique subquery */
  UniqueSubquery = 'unique_subquery',
  /** Index subquery */
  IndexSubquery = 'index_subquery',
  /** Range scan */
  Range = 'range',
  /** Full index scan */
  Index = 'index',
  /** Full table scan */
  All = 'ALL',
}

/**
 * EXPLAIN query result.
 */
export interface ExplainResult {
  /** Select identifier */
  id: number;
  /** Type of SELECT (e.g., 'SIMPLE', 'SUBQUERY') */
  selectType: string;
  /** Table name */
  table?: string;
  /** Matching partitions */
  partitions?: string;
  /** Access type */
  accessType: AccessType;
  /** Possible indexes to use */
  possibleKeys?: string;
  /** Actual index used */
  key?: string;
  /** Length of the key used */
  keyLen?: string;
  /** Columns compared to index */
  ref?: string;
  /** Estimated number of rows to examine */
  rows: number;
  /** Percentage of rows filtered by condition */
  filtered: number;
  /** Additional information */
  extra?: string;
}

// ============================================================================
// Pool Statistics
// ============================================================================

/**
 * Connection pool statistics.
 */
export interface PoolStats {
  /** Total number of connections in the pool */
  totalConnections: number;
  /** Number of active connections in use */
  activeConnections: number;
  /** Number of idle connections available */
  idleConnections: number;
  /** Number of requests waiting for a connection */
  waitingRequests: number;
  /** Maximum allowed connections */
  maxConnections: number;
  /** Total connections created since pool start */
  connectionsCreated: number;
  /** Total connections closed since pool start */
  connectionsClosed: number;
  /** Total number of connection acquisitions */
  acquireCount: number;
  /** Number of acquisition timeouts */
  acquireTimeoutCount: number;
  /** Average time to acquire a connection in milliseconds */
  avgAcquireTime: number;
}

// ============================================================================
// Health Types
// ============================================================================

/**
 * Overall database health status.
 */
export interface HealthStatus {
  /** Primary connection health */
  primary: {
    /** Whether the primary is healthy */
    healthy: boolean;
    /** Connection pool statistics for primary */
    poolStats: PoolStats;
  };
  /** Replica connection health */
  replicas: Array<{
    /** Replica endpoint identifier */
    endpoint: string;
    /** Whether the replica is healthy and available */
    healthy: boolean;
    /** Replication lag in seconds */
    lagSeconds?: number;
    /** Connection pool statistics for replica */
    poolStats: PoolStats;
  }>;
  /** Overall pool statistics across all connections */
  poolStats: PoolStats;
}

// ============================================================================
// Additional Types
// ============================================================================

/**
 * SQL query with parameters.
 */
export interface Query {
  /** SQL query string */
  sql: string;
  /** Query parameters (for prepared statements) */
  params: Value[];
  /** Query timeout in milliseconds */
  timeout?: number;
}

/**
 * Connection state.
 */
export enum ConnectionState {
  /** Connection is idle and available for use */
  Idle = 'idle',
  /** Connection is currently in use */
  InUse = 'in-use',
  /** Connection is in an active transaction */
  InTransaction = 'in-transaction',
  /** Connection is closed */
  Closed = 'closed',
}

/**
 * Active database connection.
 */
export interface Connection {
  /** Unique connection identifier */
  id: string;
  /** Current connection state */
  state: ConnectionState;
  /** When the connection was created */
  createdAt: Date;
  /** When the connection was last used */
  lastUsedAt: Date;
  /** Number of nested transactions (0 if not in transaction) */
  transactionDepth: number;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates connection configuration.
 *
 * @param config - Connection configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConnectionConfig(config: ConnectionConfig): string[] {
  const errors: string[] = [];

  // Host validation
  if (!config.host || config.host.trim().length === 0) {
    errors.push('Host cannot be empty');
  }
  if (config.host.length > 255) {
    errors.push('Host exceeds maximum length of 255 characters');
  }

  // Port validation
  if (config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  // Database validation
  if (!config.database || config.database.trim().length === 0) {
    errors.push('Database name cannot be empty');
  }
  if (config.database.length > 64) {
    errors.push('Database name exceeds MySQL maximum of 64 characters');
  }
  if (!/^[a-zA-Z0-9_$]+$/.test(config.database)) {
    errors.push('Database name must contain only alphanumeric characters, underscore, or dollar sign');
  }

  // Username validation
  if (!config.username || config.username.trim().length === 0) {
    errors.push('Username cannot be empty');
  }
  if (config.username.length > 32) {
    errors.push('Username exceeds MySQL maximum of 32 characters');
  }

  // Password validation
  if (!config.password || config.password.length === 0) {
    errors.push('Password cannot be empty');
  }

  // SSL certificate validation
  if (
    (config.sslMode === SslMode.VerifyCA || config.sslMode === SslMode.VerifyIdentity) &&
    !config.sslCa
  ) {
    errors.push(`SSL CA certificate required for SSL mode: ${config.sslMode}`);
  }

  // Charset validation
  if (!config.charset || config.charset.trim().length === 0) {
    errors.push('Charset cannot be empty');
  }
  const validCharsets = ['utf8', 'utf8mb4', 'latin1', 'ascii'];
  if (!validCharsets.includes(config.charset.toLowerCase())) {
    errors.push(`Invalid charset: ${config.charset}. Recommended: utf8mb4`);
  }

  // Collation validation
  if (!config.collation || config.collation.trim().length === 0) {
    errors.push('Collation cannot be empty');
  }

  // Timeout validation
  if (config.connectTimeoutMs < 0) {
    errors.push('Connect timeout cannot be negative');
  }
  if (config.connectTimeoutMs > 300000) {
    errors.push('Connect timeout exceeds maximum of 5 minutes (300000ms)');
  }

  if (config.readTimeoutMs !== undefined && config.readTimeoutMs < 0) {
    errors.push('Read timeout cannot be negative');
  }

  if (config.writeTimeoutMs !== undefined && config.writeTimeoutMs < 0) {
    errors.push('Write timeout cannot be negative');
  }

  return errors;
}

/**
 * Validates pool configuration.
 *
 * @param config - Pool configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validatePoolConfig(config: PoolConfig): string[] {
  const errors: string[] = [];

  // Connection count validation
  if (config.minConnections < 0) {
    errors.push('Minimum connections cannot be negative');
  }
  if (config.maxConnections < 1) {
    errors.push('Maximum connections must be at least 1');
  }
  if (config.minConnections > config.maxConnections) {
    errors.push('Minimum connections cannot exceed maximum connections');
  }
  if (config.maxConnections > 10000) {
    errors.push('Maximum connections exceeds reasonable limit of 10000');
  }

  // Timeout validation
  if (config.acquireTimeoutMs < 0) {
    errors.push('Acquire timeout cannot be negative');
  }
  if (config.acquireTimeoutMs > 300000) {
    errors.push('Acquire timeout exceeds maximum of 5 minutes (300000ms)');
  }
  if (config.idleTimeoutMs < 0) {
    errors.push('Idle timeout cannot be negative');
  }
  if (config.maxLifetimeMs < 0) {
    errors.push('Max lifetime cannot be negative');
  }
  if (config.idleTimeoutMs > config.maxLifetimeMs && config.maxLifetimeMs > 0) {
    errors.push('Idle timeout cannot exceed max lifetime');
  }

  // Validation interval check
  if (config.validationIntervalMs < 0) {
    errors.push('Validation interval cannot be negative');
  }
  if (config.validationIntervalMs > 0 && config.validationIntervalMs < 1000) {
    errors.push('Validation interval should be at least 1000ms to avoid excessive overhead');
  }

  // Validation query check
  if (!config.validationQuery || config.validationQuery.trim().length === 0) {
    errors.push('Validation query cannot be empty');
  }

  return errors;
}

/**
 * Validates transaction options.
 *
 * @param options - Transaction options to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateTransactionOptions(options: TransactionOptions): string[] {
  const errors: string[] = [];

  // Isolation level validation
  if (options.isolationLevel !== undefined) {
    const validIsolationLevels = Object.values(IsolationLevel);
    if (!validIsolationLevels.includes(options.isolationLevel)) {
      errors.push(`Invalid isolation level: ${options.isolationLevel}`);
    }
  }

  // Timeout validation
  if (options.timeoutMs !== undefined) {
    if (options.timeoutMs < 0) {
      errors.push('Transaction timeout cannot be negative');
    }
    if (options.timeoutMs > 3600000) {
      errors.push('Transaction timeout exceeds maximum of 1 hour (3600000ms)');
    }
  }

  return errors;
}

/**
 * Validates replica configuration.
 *
 * @param config - Replica configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateReplicaConfig(config: ReplicaConfig): string[] {
  const errors: string[] = [];

  // Validate primary connection
  errors.push(...validateConnectionConfig(config.primary).map(err => `Primary: ${err}`));

  // Validate replicas
  if (config.replicas.length === 0) {
    errors.push('At least one replica endpoint is required');
  }

  config.replicas.forEach((replica, index) => {
    // Validate replica connection config
    const replicaErrors = validateConnectionConfig(replica.config);
    errors.push(...replicaErrors.map(err => `Replica ${index}: ${err}`));

    // Validate weight
    if (replica.weight < 0) {
      errors.push(`Replica ${index}: Weight cannot be negative`);
    }
    if (replica.weight === 0) {
      errors.push(`Replica ${index}: Weight should be greater than 0`);
    }

    // Validate priority
    if (replica.priority < 0) {
      errors.push(`Replica ${index}: Priority cannot be negative`);
    }
  });

  // Validate max replica lag
  if (config.maxReplicaLagMs < 0) {
    errors.push('Max replica lag cannot be negative');
  }
  if (config.maxReplicaLagMs > 3600000) {
    errors.push('Max replica lag exceeds reasonable limit of 1 hour (3600000ms)');
  }

  // Validate load balance strategy
  const validStrategies = Object.values(LoadBalanceStrategy);
  if (!validStrategies.includes(config.loadBalanceStrategy)) {
    errors.push(`Invalid load balance strategy: ${config.loadBalanceStrategy}`);
  }

  return errors;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a Value is NULL.
 *
 * @param value - Value to check
 * @returns True if the value is NULL
 */
export function isNull(value: Value): value is { type: 'Null' } {
  return value.type === 'Null';
}

/**
 * Type guard to check if a Value is Boolean.
 *
 * @param value - Value to check
 * @returns True if the value is Boolean
 */
export function isBool(value: Value): value is { type: 'Bool'; value: boolean } {
  return value.type === 'Bool';
}

/**
 * Type guard to check if a Value is Int.
 *
 * @param value - Value to check
 * @returns True if the value is Int
 */
export function isInt(value: Value): value is { type: 'Int'; value: number } {
  return value.type === 'Int';
}

/**
 * Type guard to check if a Value is UInt.
 *
 * @param value - Value to check
 * @returns True if the value is UInt
 */
export function isUInt(value: Value): value is { type: 'UInt'; value: number } {
  return value.type === 'UInt';
}

/**
 * Type guard to check if a Value is String.
 *
 * @param value - Value to check
 * @returns True if the value is String
 */
export function isString(value: Value): value is { type: 'String'; value: string } {
  return value.type === 'String';
}

/**
 * Type guard to check if a Value is JSON.
 *
 * @param value - Value to check
 * @returns True if the value is JSON
 */
export function isJson(value: Value): value is { type: 'Json'; value: unknown } {
  return value.type === 'Json';
}

/**
 * Type guard to check if a Value is DateTime.
 *
 * @param value - Value to check
 * @returns True if the value is DateTime
 */
export function isDateTime(value: Value): value is { type: 'DateTime'; value: Date } {
  return value.type === 'DateTime';
}

/**
 * Type guard to check if a Value is Decimal.
 *
 * @param value - Value to check
 * @returns True if the value is Decimal
 */
export function isDecimal(value: Value): value is { type: 'Decimal'; value: string } {
  return value.type === 'Decimal';
}

/**
 * Type guard to check if a Value is Bytes.
 *
 * @param value - Value to check
 * @returns True if the value is Bytes
 */
export function isBytes(value: Value): value is { type: 'Bytes'; value: Uint8Array } {
  return value.type === 'Bytes';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a Row instance with typed get() method.
 *
 * @param values - Array of values for the row
 * @returns Row object with get() method
 */
export function createRow(values: Value[]): Row {
  return {
    values,
    get(index: number): Value {
      if (index < 0 || index >= values.length) {
        throw new Error(`Column index ${index} out of bounds (0-${values.length - 1})`);
      }
      return values[index];
    },
  };
}

/**
 * Extracts a native JavaScript value from a Value union type.
 *
 * @param value - MySQL Value to extract
 * @returns Native JavaScript value or null
 */
export function extractValue(value: Value): unknown {
  switch (value.type) {
    case 'Null':
      return null;
    case 'Bool':
    case 'Int':
    case 'UInt':
    case 'Float':
    case 'Double':
    case 'String':
    case 'Bytes':
    case 'Date':
    case 'Time':
    case 'DateTime':
    case 'Timestamp':
    case 'Decimal':
    case 'Json':
      return value.value;
    default:
      // Exhaustiveness check
      const _exhaustive: never = value;
      return _exhaustive;
  }
}

/**
 * Converts a native JavaScript value to a MySQL Value type.
 *
 * @param value - Native JavaScript value
 * @returns MySQL Value union type
 */
export function toValue(value: unknown): Value {
  if (value === null || value === undefined) {
    return { type: 'Null' };
  }
  if (typeof value === 'boolean') {
    return { type: 'Bool', value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value >= 0 ? { type: 'UInt', value } : { type: 'Int', value };
    }
    return { type: 'Double', value };
  }
  if (typeof value === 'string') {
    return { type: 'String', value };
  }
  if (value instanceof Date) {
    return { type: 'DateTime', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'Bytes', value };
  }
  // Treat objects as JSON
  return { type: 'Json', value };
}

/**
 * Generates a transaction ID.
 *
 * @returns Unique transaction identifier
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `txn_${timestamp}_${randomPart}`;
}

/**
 * Generates a savepoint name.
 *
 * @param index - Savepoint index within the transaction
 * @returns Savepoint name
 */
export function generateSavepointName(index: number): string {
  return `sp_${index}`;
}

/**
 * Checks if a query is a read-only SELECT statement.
 *
 * @param sql - SQL query to analyze
 * @returns True if the query is read-only
 */
export function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  // Read-only queries: SELECT, SHOW, DESCRIBE, EXPLAIN
  if (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('SHOW') ||
    normalized.startsWith('DESCRIBE') ||
    normalized.startsWith('DESC') ||
    normalized.startsWith('EXPLAIN')
  ) {
    // Make sure it doesn't contain write operations
    return (
      !normalized.includes('INSERT') &&
      !normalized.includes('UPDATE') &&
      !normalized.includes('DELETE') &&
      !normalized.includes('CREATE') &&
      !normalized.includes('ALTER') &&
      !normalized.includes('DROP') &&
      !normalized.includes('TRUNCATE') &&
      !normalized.includes('LOCK') &&
      !normalized.includes('UNLOCK')
    );
  }
  return false;
}

/**
 * Checks if a query is a write operation.
 *
 * @param sql - SQL query to analyze
 * @returns True if the query is a write operation
 */
export function isWriteQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return (
    normalized.startsWith('INSERT') ||
    normalized.startsWith('UPDATE') ||
    normalized.startsWith('DELETE') ||
    normalized.startsWith('CREATE') ||
    normalized.startsWith('ALTER') ||
    normalized.startsWith('DROP') ||
    normalized.startsWith('TRUNCATE') ||
    normalized.startsWith('REPLACE') ||
    normalized.startsWith('LOCK') ||
    normalized.startsWith('UNLOCK') ||
    normalized.startsWith('SET') ||
    normalized.startsWith('GRANT') ||
    normalized.startsWith('REVOKE')
  );
}

/**
 * Checks if a query is a transaction control statement.
 *
 * @param sql - SQL query to analyze
 * @returns True if the query is a transaction control statement
 */
export function isTransactionQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return (
    normalized.startsWith('BEGIN') ||
    normalized.startsWith('START TRANSACTION') ||
    normalized.startsWith('COMMIT') ||
    normalized.startsWith('ROLLBACK') ||
    normalized.startsWith('SAVEPOINT') ||
    normalized.startsWith('RELEASE SAVEPOINT')
  );
}

/**
 * Categorizes replication lag.
 *
 * @param lagSeconds - Replication lag in seconds
 * @returns Lag category: 'healthy', 'warning', or 'critical'
 */
export function categorizeLag(
  lagSeconds: number
): 'healthy' | 'warning' | 'critical' {
  if (lagSeconds < 1) {
    // < 1 second
    return 'healthy';
  }
  if (lagSeconds < 10) {
    // < 10 seconds
    return 'warning';
  }
  return 'critical';
}

/**
 * Creates default column flags.
 *
 * @returns ColumnFlags with all flags set to false
 */
export function createDefaultColumnFlags(): ColumnFlags {
  return {
    notNull: false,
    primaryKey: false,
    uniqueKey: false,
    multipleKey: false,
    blob: false,
    unsigned: false,
    zerofill: false,
    binary: false,
    enum: false,
    autoIncrement: false,
    timestamp: false,
    set: false,
  };
}

/**
 * Formats a connection string for logging (with password redacted).
 *
 * @param config - Connection configuration
 * @returns Safe connection string for logging
 */
export function formatConnectionString(config: ConnectionConfig): string {
  return `mysql://${config.username}:***@${config.host}:${config.port}/${config.database}`;
}

/**
 * Generates a connection ID.
 *
 * @returns Unique connection identifier
 */
export function generateConnectionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `conn_${timestamp}_${randomPart}`;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default MySQL port.
 */
export const DEFAULT_MYSQL_PORT = 3306;

/**
 * Default character set.
 */
export const DEFAULT_CHARSET = 'utf8mb4';

/**
 * Default collation.
 */
export const DEFAULT_COLLATION = 'utf8mb4_unicode_ci';

/**
 * Default connection timeout (10 seconds).
 */
export const DEFAULT_CONNECT_TIMEOUT = 10000;

/**
 * Default acquire timeout (30 seconds).
 */
export const DEFAULT_ACQUIRE_TIMEOUT = 30000;

/**
 * Default idle timeout (10 minutes).
 */
export const DEFAULT_IDLE_TIMEOUT = 600000;

/**
 * Default max connection lifetime (30 minutes).
 */
export const DEFAULT_MAX_LIFETIME = 1800000;

/**
 * Default validation interval (30 seconds).
 */
export const DEFAULT_VALIDATION_INTERVAL = 30000;

/**
 * Default validation query.
 */
export const DEFAULT_VALIDATION_QUERY = 'SELECT 1';

/**
 * Default minimum connections in pool.
 */
export const DEFAULT_MIN_CONNECTIONS = 5;

/**
 * Default maximum connections in pool.
 */
export const DEFAULT_MAX_CONNECTIONS = 20;

/**
 * Default maximum replica lag (1 second).
 */
export const DEFAULT_MAX_REPLICA_LAG = 1000;

/**
 * MySQL identifier maximum length.
 */
export const MYSQL_IDENTIFIER_MAX_LENGTH = 64;

/**
 * MySQL username maximum length.
 */
export const MYSQL_USERNAME_MAX_LENGTH = 32;

/**
 * Default query timeout (30 seconds).
 */
export const DEFAULT_QUERY_TIMEOUT = 30000;

/**
 * Maximum safe query size (16MB).
 */
export const MAX_QUERY_SIZE_BYTES = 16 * 1024 * 1024;

/**
 * Default stream batch size.
 */
export const DEFAULT_STREAM_BATCH_SIZE = 1000;
