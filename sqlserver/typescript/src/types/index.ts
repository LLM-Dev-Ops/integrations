/**
 * SQL Server type definitions following SPARC specification.
 *
 * Core types for database connections, queries, transactions, and routing.
 * Normalized to platform's provider-agnostic relational database interfaces.
 */

// ============================================================================
// Connection Types
// ============================================================================

/**
 * SQL Server encryption mode for connections.
 */
export enum EncryptionMode {
  /** No encryption (not recommended for production) */
  Disable = 'disable',
  /** Require encryption */
  Require = 'require',
  /** Require encryption and verify server certificate */
  Strict = 'strict',
}

/**
 * SQL Server authentication type.
 */
export enum AuthenticationType {
  /** SQL Server authentication (username/password) */
  SqlServer = 'sql-server',
  /** Windows integrated authentication */
  Windows = 'windows',
  /** Azure Active Directory password authentication */
  AzureActiveDirectoryPassword = 'azure-ad-password',
  /** Azure Active Directory managed identity */
  AzureActiveDirectoryMsi = 'azure-ad-msi',
  /** Azure Active Directory service principal */
  AzureActiveDirectoryServicePrincipal = 'azure-ad-sp',
}

/**
 * SQL Server connection configuration.
 *
 * SECURITY: password field is marked as sensitive and never logged.
 */
export interface ConnectionConfig {
  /** Database server hostname or IP address */
  host: string;
  /** Database server port (default: 1433) */
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
  /** Authentication type */
  authenticationType: AuthenticationType;
  /** Encryption mode for connection */
  encryptionMode: EncryptionMode;
  /** Whether to trust the server certificate (for self-signed certs) */
  trustServerCertificate: boolean;
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Request timeout in milliseconds */
  requestTimeout: number;
  /** Application name for connection tracking */
  applicationName: string;
  /** SQL Server instance name (for named instances) */
  instanceName?: string;
  /** Domain for Windows authentication */
  domain?: string;
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
  | bigint
  | QueryParam[];

/**
 * Database column metadata.
 */
export interface Column {
  /** Column name */
  name: string;
  /** SQL Server data type name */
  typeName: string;
  /** Column length (for variable-length types) */
  length?: number;
  /** Numeric precision */
  precision?: number;
  /** Numeric scale */
  scale?: number;
  /** Whether the column allows NULL values */
  nullable: boolean;
}

/**
 * SQL Server value types.
 */
export type Value =
  | { type: 'Null' }
  | { type: 'Bit'; value: boolean }
  | { type: 'TinyInt'; value: number }
  | { type: 'SmallInt'; value: number }
  | { type: 'Int'; value: number }
  | { type: 'BigInt'; value: bigint }
  | { type: 'Real'; value: number }
  | { type: 'Float'; value: number }
  | { type: 'Decimal'; value: string }
  | { type: 'Money'; value: string }
  | { type: 'SmallMoney'; value: string }
  | { type: 'Char'; value: string }
  | { type: 'VarChar'; value: string }
  | { type: 'Text'; value: string }
  | { type: 'NChar'; value: string }
  | { type: 'NVarChar'; value: string }
  | { type: 'NText'; value: string }
  | { type: 'Binary'; value: Uint8Array }
  | { type: 'VarBinary'; value: Uint8Array }
  | { type: 'Image'; value: Uint8Array }
  | { type: 'DateTime'; value: Date }
  | { type: 'DateTime2'; value: Date }
  | { type: 'SmallDateTime'; value: Date }
  | { type: 'Date'; value: Date }
  | { type: 'Time'; value: string }
  | { type: 'DateTimeOffset'; value: Date }
  | { type: 'UniqueIdentifier'; value: string }
  | { type: 'Xml'; value: string }
  | { type: 'Json'; value: unknown }
  | { type: 'Geography'; value: unknown }
  | { type: 'Geometry'; value: unknown }
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
  /** Read uncommitted data (dirty reads possible) */
  ReadUncommitted = 'READ UNCOMMITTED',
  /** Default isolation level in SQL Server */
  ReadCommitted = 'READ COMMITTED',
  /** Prevents non-repeatable reads */
  RepeatableRead = 'REPEATABLE READ',
  /** Highest isolation level using locks */
  Serializable = 'SERIALIZABLE',
  /** Optimistic concurrency using row versioning */
  Snapshot = 'SNAPSHOT',
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
  /** Transaction name (for identification in logs/traces) */
  name?: string;
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
  | { type: 'Replica'; lagSeconds: number };

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
  /** Replication lag in seconds */
  lagSeconds: number;
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
  if (config.database.length > 128) {
    errors.push('Database name exceeds SQL Server maximum of 128 characters');
  }

  // Username validation (not required for Windows auth)
  if (config.authenticationType !== AuthenticationType.Windows) {
    if (!config.username || config.username.trim().length === 0) {
      errors.push('Username cannot be empty for SQL Server authentication');
    }
    if (config.username.length > 128) {
      errors.push('Username exceeds SQL Server maximum of 128 characters');
    }

    // Password validation
    if (!config.password || config.password.length === 0) {
      errors.push('Password cannot be empty');
    }
  }

  // Timeout validation
  if (config.connectTimeout < 0) {
    errors.push('Connect timeout cannot be negative');
  }
  if (config.connectTimeout > 300000) {
    errors.push('Connect timeout exceeds maximum of 5 minutes (300000ms)');
  }
  if (config.requestTimeout < 0) {
    errors.push('Request timeout cannot be negative');
  }

  // Application name validation
  if (!config.applicationName || config.applicationName.trim().length === 0) {
    errors.push('Application name cannot be empty');
  }
  if (config.applicationName.length > 128) {
    errors.push('Application name exceeds maximum length of 128 characters');
  }

  // Instance name validation
  if (config.instanceName && config.instanceName.length > 64) {
    errors.push('Instance name exceeds maximum length of 64 characters');
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

  // Transaction name validation
  if (options.name && options.name.length > 32) {
    errors.push('Transaction name exceeds SQL Server maximum of 32 characters');
  }

  return errors;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a ConnectionRole is Primary.
 */
export function isPrimary(role: ConnectionRole): role is { type: 'Primary' } {
  return role.type === 'Primary';
}

/**
 * Type guard to check if a ConnectionRole is Replica.
 */
export function isReplica(
  role: ConnectionRole
): role is { type: 'Replica'; lagSeconds: number } {
  return role.type === 'Replica';
}

/**
 * Type guard to check if a Value is NULL.
 */
export function isNull(value: Value): value is { type: 'Null' } {
  return value.type === 'Null';
}

/**
 * Type guard to check if a Value is Bit (boolean).
 */
export function isBit(value: Value): value is { type: 'Bit'; value: boolean } {
  return value.type === 'Bit';
}

/**
 * Type guard to check if a Value is VarChar/NVarChar.
 */
export function isString(
  value: Value
): value is
  | { type: 'Char'; value: string }
  | { type: 'VarChar'; value: string }
  | { type: 'Text'; value: string }
  | { type: 'NChar'; value: string }
  | { type: 'NVarChar'; value: string }
  | { type: 'NText'; value: string } {
  return ['Char', 'VarChar', 'Text', 'NChar', 'NVarChar', 'NText'].includes(value.type);
}

/**
 * Type guard to check if a Value is Json.
 */
export function isJson(value: Value): value is { type: 'Json'; value: unknown } {
  return value.type === 'Json';
}

/**
 * Type guard to check if a Value is BigInt.
 */
export function isBigInt(value: Value): value is { type: 'BigInt'; value: bigint } {
  return value.type === 'BigInt';
}

/**
 * Type guard to check if a Value is DateTime.
 */
export function isDateTime(
  value: Value
): value is
  | { type: 'DateTime'; value: Date }
  | { type: 'DateTime2'; value: Date }
  | { type: 'SmallDateTime'; value: Date }
  | { type: 'Date'; value: Date }
  | { type: 'DateTimeOffset'; value: Date } {
  return ['DateTime', 'DateTime2', 'SmallDateTime', 'Date', 'DateTimeOffset'].includes(value.type);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a Row instance with typed get() method.
 */
export function createRow(values: Value[]): Row {
  return {
    values,
    get(index: number): Value {
      if (index < 0 || index >= values.length) {
        throw new Error(`Column index ${index} out of bounds (0-${values.length - 1})`);
      }
      const value = values[index];
      if (value === undefined) {
        throw new Error(`Column index ${index} is undefined`);
      }
      return value;
    },
  };
}

/**
 * Extracts a native JavaScript value from a Value union type.
 */
export function extractValue(value: Value): unknown {
  switch (value.type) {
    case 'Null':
      return null;
    case 'Bit':
    case 'TinyInt':
    case 'SmallInt':
    case 'Int':
    case 'BigInt':
    case 'Real':
    case 'Float':
    case 'Decimal':
    case 'Money':
    case 'SmallMoney':
    case 'Char':
    case 'VarChar':
    case 'Text':
    case 'NChar':
    case 'NVarChar':
    case 'NText':
    case 'Binary':
    case 'VarBinary':
    case 'Image':
    case 'DateTime':
    case 'DateTime2':
    case 'SmallDateTime':
    case 'Date':
    case 'Time':
    case 'DateTimeOffset':
    case 'UniqueIdentifier':
    case 'Xml':
    case 'Json':
    case 'Geography':
    case 'Geometry':
      return value.value;
    case 'Custom':
      return value.value;
    default:
      // Exhaustiveness check
      const _exhaustive: never = value;
      return _exhaustive;
  }
}

/**
 * Converts a native JavaScript value to a SQL Server Value type.
 */
export function toValue(value: unknown): Value {
  if (value === null || value === undefined) {
    return { type: 'Null' };
  }
  if (typeof value === 'boolean') {
    return { type: 'Bit', value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 255) {
        return { type: 'TinyInt', value };
      }
      if (value >= -32768 && value <= 32767) {
        return { type: 'SmallInt', value };
      }
      if (value >= -2147483648 && value <= 2147483647) {
        return { type: 'Int', value };
      }
    }
    return { type: 'Float', value };
  }
  if (typeof value === 'bigint') {
    return { type: 'BigInt', value };
  }
  if (typeof value === 'string') {
    // Check if it's a UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return { type: 'UniqueIdentifier', value };
    }
    return { type: 'NVarChar', value };
  }
  if (value instanceof Date) {
    return { type: 'DateTime2', value };
  }
  if (value instanceof Uint8Array || value instanceof Buffer) {
    return { type: 'VarBinary', value: value instanceof Buffer ? new Uint8Array(value) : value };
  }
  if (Array.isArray(value)) {
    // SQL Server doesn't have native array types, convert to JSON
    return { type: 'Json', value };
  }
  // Treat objects as JSON
  return { type: 'Json', value };
}

/**
 * Determines the replication lag category for monitoring.
 */
export function categorizeLag(
  lagSeconds: number
): 'healthy' | 'warning' | 'critical' {
  if (lagSeconds < 5) {
    return 'healthy';
  }
  if (lagSeconds < 30) {
    return 'warning';
  }
  return 'critical';
}

/**
 * Generates a transaction ID.
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `txn_${timestamp}_${randomPart}`;
}

/**
 * Generates a savepoint name.
 */
export function generateSavepointName(index: number): string {
  return `sp_${index}`;
}

/**
 * Checks if a query is a read-only SELECT statement.
 */
export function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return (
    normalized.startsWith('SELECT') &&
    !normalized.includes('INSERT') &&
    !normalized.includes('UPDATE') &&
    !normalized.includes('DELETE') &&
    !normalized.includes('CREATE') &&
    !normalized.includes('ALTER') &&
    !normalized.includes('DROP') &&
    !normalized.includes('TRUNCATE') &&
    !normalized.includes('INTO')
  );
}

/**
 * Determines query intent from SQL statement.
 */
export function determineQueryIntent(sql: string): QueryIntent {
  const normalized = sql.trim().toUpperCase();

  // Transaction control
  if (
    normalized.startsWith('BEGIN') ||
    normalized.startsWith('COMMIT') ||
    normalized.startsWith('ROLLBACK') ||
    normalized.startsWith('SAVE TRANSACTION') ||
    normalized.startsWith('SET TRANSACTION')
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
    normalized.startsWith('REVOKE') ||
    normalized.startsWith('MERGE') ||
    normalized.startsWith('EXEC') ||
    normalized.startsWith('EXECUTE')
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
 * Default SQL Server port.
 */
export const DEFAULT_SQLSERVER_PORT = 1433;

/**
 * Default connection timeout (30 seconds).
 */
export const DEFAULT_CONNECT_TIMEOUT = 30000;

/**
 * Default request timeout (30 seconds).
 */
export const DEFAULT_REQUEST_TIMEOUT = 30000;

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
 * Maximum safe replication lag in seconds.
 */
export const MAX_SAFE_REPLICATION_LAG = 30;

/**
 * SQL Server identifier maximum length.
 */
export const SQLSERVER_IDENTIFIER_MAX_LENGTH = 128;
