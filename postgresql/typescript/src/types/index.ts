/**
 * PostgreSQL type definitions following SPARC specification.
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
  Disable = 'disable',
  /** Prefer SSL/TLS but allow unencrypted if server doesn't support it */
  Prefer = 'prefer',
  /** Require SSL/TLS encryption */
  Require = 'require',
  /** Require SSL/TLS and verify CA certificate */
  VerifyCa = 'verify-ca',
  /** Require SSL/TLS and verify full certificate chain */
  VerifyFull = 'verify-full',
}

/**
 * PostgreSQL connection configuration.
 *
 * SECURITY: password field is marked as sensitive and never logged.
 */
export interface ConnectionConfig {
  /** Database server hostname or IP address */
  host: string;
  /** Database server port (default: 5432) */
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
  /** SSL/TLS certificate (PEM format) for verification */
  sslCert?: string;
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Application name for connection tracking */
  applicationName: string;
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
  acquireTimeout: number;
  /** Time a connection can be idle before being closed (ms) */
  idleTimeout: number;
  /** Maximum lifetime of a connection before rotation (ms) */
  maxLifetime: number;
  /** Interval for health checks on idle connections (ms) */
  healthCheckInterval: number;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query parameter types.
 */
export type QueryParam =
  | null
  | boolean
  | number
  | string
  | Date
  | Buffer
  | QueryParam[];

/**
 * Database column metadata.
 */
export interface Column {
  /** Column name */
  name: string;
  /** PostgreSQL type OID */
  typeOid: number;
  /** Human-readable type name */
  typeName: string;
  /** Whether the column allows NULL values */
  nullable: boolean;
}

/**
 * PostgreSQL value types.
 */
export type Value =
  | { type: 'Null' }
  | { type: 'Bool'; value: boolean }
  | { type: 'Int16'; value: number }
  | { type: 'Int32'; value: number }
  | { type: 'Int64'; value: bigint }
  | { type: 'Float32'; value: number }
  | { type: 'Float64'; value: number }
  | { type: 'Text'; value: string }
  | { type: 'Bytea'; value: Uint8Array }
  | { type: 'Timestamp'; value: Date }
  | { type: 'Uuid'; value: string }
  | { type: 'Json'; value: unknown }
  | { type: 'Array'; value: Value[] }
  | { type: 'Custom'; typeName: string; value: unknown };

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
 * Query execution result.
 */
export interface QueryResult {
  /** Number of rows affected by the query */
  rowsAffected: number;
  /** Column metadata (empty for non-SELECT queries) */
  columns: Column[];
  /** Result rows (empty for non-SELECT queries) */
  rows: Row[];
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction isolation level.
 */
export enum IsolationLevel {
  /** Lowest isolation level (rarely used in PostgreSQL) */
  ReadUncommitted = 'READ UNCOMMITTED',
  /** Default isolation level in PostgreSQL */
  ReadCommitted = 'READ COMMITTED',
  /** Prevents non-repeatable reads */
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
  isolation: IsolationLevel;
  /** Whether the transaction is read-only */
  readOnly: boolean;
  /** Whether constraints can be deferred until commit */
  deferrable: boolean;
}

/**
 * Active database transaction.
 */
export interface Transaction {
  /** Unique transaction identifier */
  id: string;
  /** Transaction isolation level */
  isolation: IsolationLevel;
  /** Whether the transaction is read-only */
  readOnly: boolean;
  /** When the transaction started */
  startedAt: Date;
  /** Active savepoints within this transaction */
  savepoints: Savepoint[];
}

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Connection routing policy for read/write distribution.
 */
export enum RoutingPolicy {
  /** Always route to primary (for writes and critical reads) */
  Primary = 'primary',
  /** Route to replica (for read-only queries) */
  Replica = 'replica',
  /** Distribute across replicas in round-robin fashion */
  RoundRobin = 'round-robin',
  /** Route to replica with fewest active connections */
  LeastConnections = 'least-connections',
  /** Route to a random replica */
  Random = 'random',
}

/**
 * Query intent for routing decisions.
 */
export enum QueryIntent {
  /** Read-only query (can be routed to replica) */
  Read = 'read',
  /** Write query (must go to primary) */
  Write = 'write',
  /** Transaction (typically routed to primary) */
  Transaction = 'transaction',
}

/**
 * Connection role with replication lag information.
 */
export type ConnectionRole =
  | { type: 'Primary' }
  | { type: 'Replica'; lagBytes: number };

// ============================================================================
// Health Types
// ============================================================================

/**
 * Connection pool statistics.
 */
export interface PoolStats {
  /** Number of active connections in use */
  activeConnections: number;
  /** Number of idle connections available */
  idleConnections: number;
  /** Total connections in the pool */
  totalConnections: number;
  /** Number of connections waiting to be acquired */
  waitingRequests: number;
}

/**
 * Replica health information.
 */
export interface ReplicaHealth {
  /** Replica index/identifier */
  index: number;
  /** Whether the replica is healthy and available */
  healthy: boolean;
  /** Replication lag in bytes */
  lagBytes: number;
}

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
  replicas: ReplicaHealth[];
  /** Overall pool statistics across all connections */
  poolStats: PoolStats;
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
  if (config.database.length > 63) {
    errors.push('Database name exceeds PostgreSQL maximum of 63 characters');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.database)) {
    errors.push('Database name must start with letter/underscore and contain only alphanumeric/underscore');
  }

  // Username validation
  if (!config.username || config.username.trim().length === 0) {
    errors.push('Username cannot be empty');
  }
  if (config.username.length > 63) {
    errors.push('Username exceeds PostgreSQL maximum of 63 characters');
  }

  // Password validation
  if (!config.password || config.password.length === 0) {
    errors.push('Password cannot be empty');
  }

  // SSL certificate validation
  if (
    (config.sslMode === SslMode.VerifyCa || config.sslMode === SslMode.VerifyFull) &&
    !config.sslCert
  ) {
    errors.push(`SSL certificate required for SSL mode: ${config.sslMode}`);
  }

  // Timeout validation
  if (config.connectTimeout < 0) {
    errors.push('Connect timeout cannot be negative');
  }
  if (config.connectTimeout > 300000) {
    errors.push('Connect timeout exceeds maximum of 5 minutes (300000ms)');
  }

  // Application name validation
  if (!config.applicationName || config.applicationName.trim().length === 0) {
    errors.push('Application name cannot be empty');
  }
  if (config.applicationName.length > 64) {
    errors.push('Application name exceeds maximum length of 64 characters');
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
  if (config.acquireTimeout < 0) {
    errors.push('Acquire timeout cannot be negative');
  }
  if (config.acquireTimeout > 300000) {
    errors.push('Acquire timeout exceeds maximum of 5 minutes (300000ms)');
  }
  if (config.idleTimeout < 0) {
    errors.push('Idle timeout cannot be negative');
  }
  if (config.maxLifetime < 0) {
    errors.push('Max lifetime cannot be negative');
  }
  if (config.idleTimeout > config.maxLifetime && config.maxLifetime > 0) {
    errors.push('Idle timeout cannot exceed max lifetime');
  }

  // Health check validation
  if (config.healthCheckInterval < 0) {
    errors.push('Health check interval cannot be negative');
  }
  if (config.healthCheckInterval > 0 && config.healthCheckInterval < 1000) {
    errors.push('Health check interval should be at least 1000ms to avoid excessive overhead');
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
  const validIsolationLevels = Object.values(IsolationLevel);
  if (!validIsolationLevels.includes(options.isolation)) {
    errors.push(`Invalid isolation level: ${options.isolation}`);
  }

  // Deferrable constraint validation
  if (options.deferrable && !options.readOnly) {
    // Note: In PostgreSQL, DEFERRABLE is typically used with Serializable transactions
    if (options.isolation !== IsolationLevel.Serializable) {
      errors.push('DEFERRABLE transactions are most meaningful with SERIALIZABLE isolation level');
    }
  }

  return errors;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a ConnectionRole is Primary.
 *
 * @param role - Connection role to check
 * @returns True if the role is Primary
 */
export function isPrimary(role: ConnectionRole): role is { type: 'Primary' } {
  return role.type === 'Primary';
}

/**
 * Type guard to check if a ConnectionRole is Replica.
 *
 * @param role - Connection role to check
 * @returns True if the role is Replica
 */
export function isReplica(
  role: ConnectionRole
): role is { type: 'Replica'; lagBytes: number } {
  return role.type === 'Replica';
}

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
 * Type guard to check if a Value is Text.
 *
 * @param value - Value to check
 * @returns True if the value is Text
 */
export function isText(value: Value): value is { type: 'Text'; value: string } {
  return value.type === 'Text';
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
 * Type guard to check if a Value is an Array.
 *
 * @param value - Value to check
 * @returns True if the value is an Array
 */
export function isArray(value: Value): value is { type: 'Array'; value: Value[] } {
  return value.type === 'Array';
}

/**
 * Type guard to check if a Value is Int64.
 *
 * @param value - Value to check
 * @returns True if the value is Int64
 */
export function isInt64(value: Value): value is { type: 'Int64'; value: bigint } {
  return value.type === 'Int64';
}

/**
 * Type guard to check if a Value is Timestamp.
 *
 * @param value - Value to check
 * @returns True if the value is Timestamp
 */
export function isTimestamp(value: Value): value is { type: 'Timestamp'; value: Date } {
  return value.type === 'Timestamp';
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
      return values[index]!;
    },
  };
}

/**
 * Extracts a native JavaScript value from a Value union type.
 *
 * @param value - PostgreSQL Value to extract
 * @returns Native JavaScript value or null
 */
export function extractValue(value: Value): unknown {
  switch (value.type) {
    case 'Null':
      return null;
    case 'Bool':
    case 'Int16':
    case 'Int32':
    case 'Int64':
    case 'Float32':
    case 'Float64':
    case 'Text':
    case 'Bytea':
    case 'Timestamp':
    case 'Uuid':
    case 'Json':
      return value.value;
    case 'Array':
      return value.value.map(extractValue);
    case 'Custom':
      return value.value;
    default:
      // Exhaustiveness check
      const _exhaustive: never = value;
      return _exhaustive;
  }
}

/**
 * Converts a native JavaScript value to a PostgreSQL Value type.
 *
 * @param value - Native JavaScript value
 * @returns PostgreSQL Value union type
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
      if (value >= -32768 && value <= 32767) {
        return { type: 'Int16', value };
      }
      if (value >= -2147483648 && value <= 2147483647) {
        return { type: 'Int32', value };
      }
    }
    return { type: 'Float64', value };
  }
  if (typeof value === 'bigint') {
    return { type: 'Int64', value };
  }
  if (typeof value === 'string') {
    // Check if it's a UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return { type: 'Uuid', value };
    }
    return { type: 'Text', value };
  }
  if (value instanceof Date) {
    return { type: 'Timestamp', value };
  }
  if (value instanceof Uint8Array) {
    return { type: 'Bytea', value };
  }
  if (Array.isArray(value)) {
    return { type: 'Array', value: value.map(toValue) };
  }
  // Treat objects as JSON
  return { type: 'Json', value };
}

/**
 * Determines the replication lag category for monitoring.
 *
 * @param lagBytes - Replication lag in bytes
 * @returns Lag category: 'healthy', 'warning', or 'critical'
 */
export function categorizeLag(
  lagBytes: number
): 'healthy' | 'warning' | 'critical' {
  if (lagBytes < 1024 * 1024) {
    // < 1MB
    return 'healthy';
  }
  if (lagBytes < 100 * 1024 * 1024) {
    // < 100MB
    return 'warning';
  }
  return 'critical';
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
  // Simple heuristic: starts with SELECT and doesn't contain data modification
  return (
    normalized.startsWith('SELECT') &&
    !normalized.includes('INSERT') &&
    !normalized.includes('UPDATE') &&
    !normalized.includes('DELETE') &&
    !normalized.includes('CREATE') &&
    !normalized.includes('ALTER') &&
    !normalized.includes('DROP') &&
    !normalized.includes('TRUNCATE')
  );
}

/**
 * Determines query intent from SQL statement.
 *
 * @param sql - SQL query to analyze
 * @returns Query intent (Read, Write, or Transaction)
 */
export function determineQueryIntent(sql: string): QueryIntent {
  const normalized = sql.trim().toUpperCase();

  // Transaction control
  if (
    normalized.startsWith('BEGIN') ||
    normalized.startsWith('START TRANSACTION') ||
    normalized.startsWith('COMMIT') ||
    normalized.startsWith('ROLLBACK') ||
    normalized.startsWith('SAVEPOINT') ||
    normalized.startsWith('RELEASE')
  ) {
    return QueryIntent.Transaction;
  }

  // Write operations
  if (
    normalized.startsWith('INSERT') ||
    normalized.startsWith('UPDATE') ||
    normalized.startsWith('DELETE') ||
    normalized.startsWith('CREATE') ||
    normalized.startsWith('ALTER') ||
    normalized.startsWith('DROP') ||
    normalized.startsWith('TRUNCATE') ||
    normalized.startsWith('GRANT') ||
    normalized.startsWith('REVOKE')
  ) {
    return QueryIntent.Write;
  }

  // Default to read
  return QueryIntent.Read;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default PostgreSQL port.
 */
export const DEFAULT_POSTGRES_PORT = 5432;

/**
 * Default connection timeout (30 seconds).
 */
export const DEFAULT_CONNECT_TIMEOUT = 30000;

/**
 * Default acquire timeout (10 seconds).
 */
export const DEFAULT_ACQUIRE_TIMEOUT = 10000;

/**
 * Default idle timeout (10 minutes).
 */
export const DEFAULT_IDLE_TIMEOUT = 600000;

/**
 * Default max connection lifetime (30 minutes).
 */
export const DEFAULT_MAX_LIFETIME = 1800000;

/**
 * Default health check interval (30 seconds).
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;

/**
 * Default minimum connections in pool.
 */
export const DEFAULT_MIN_CONNECTIONS = 2;

/**
 * Default maximum connections in pool.
 */
export const DEFAULT_MAX_CONNECTIONS = 10;

/**
 * Maximum safe replication lag in bytes (100MB).
 */
export const MAX_SAFE_REPLICATION_LAG = 100 * 1024 * 1024;

/**
 * PostgreSQL identifier maximum length.
 */
export const POSTGRES_IDENTIFIER_MAX_LENGTH = 63;
