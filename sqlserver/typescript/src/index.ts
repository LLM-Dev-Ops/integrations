/**
 * SQL Server Integration for LLM Dev Ops Platform
 *
 * Provides a clean, minimal adapter layer for SQL Server database operations
 * following the SPARC specification. Implements connection pooling, query execution,
 * transactional operations, prepared statements, error classification, and
 * performance metadata capture.
 *
 * @module @llmdevops/sqlserver-integration
 */

// ============================================================================
// Type Exports
// ============================================================================

export {
  // Connection types
  ConnectionConfig,
  PoolConfig,
  EncryptionMode,
  AuthenticationType,

  // Query types
  QueryParam,
  Column,
  Value,
  Row,
  QueryResult,

  // Transaction types
  IsolationLevel,
  Savepoint,
  TransactionOptions,
  Transaction,

  // Routing types
  RoutingPolicy,
  QueryIntent,
  ConnectionRole,

  // Health types
  PoolStats,
  ReplicaHealth,
  HealthStatus,

  // Validation utilities
  validateConnectionConfig,
  validatePoolConfig,
  validateTransactionOptions,

  // Type guards
  isPrimary,
  isReplica,
  isNull,
  isBit,
  isString,
  isJson,
  isBigInt,
  isDateTime,

  // Helper functions
  createRow,
  extractValue,
  toValue,
  categorizeLag,
  generateTransactionId,
  generateSavepointName,
  isReadOnlyQuery,
  determineQueryIntent,

  // Constants
  DEFAULT_SQLSERVER_PORT,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS,
  MAX_SAFE_REPLICATION_LAG,
  SQLSERVER_IDENTIFIER_MAX_LENGTH,
} from './types/index.js';

// ============================================================================
// Error Exports
// ============================================================================

export {
  // Error codes
  SqlServerErrorCode,
  SqlServerErrorNumber,

  // Error response type
  SqlServerErrorResponse,

  // Base error class
  SqlServerError,

  // Configuration errors
  ConfigurationError,
  NoCredentialsError,
  InvalidConnectionStringError,

  // Connection errors
  ConnectionFailedError,
  AcquireTimeoutError,
  PoolExhaustedError,
  TlsError,
  NetworkError,

  // Authentication errors
  AuthenticationFailedError,
  LoginFailedError,
  PasswordExpiredError,

  // Query errors
  ExecutionError,
  NoRowsError,
  TooManyRowsError,
  QueryTimeoutError,
  ParamCountMismatchError,
  QueryCanceledError,

  // Transaction errors
  DeadlockDetectedError,
  LockTimeoutError,
  TransactionAbortedError,
  InvalidSavepointError,
  TransactionRollbackError,
  SnapshotIsolationConflictError,

  // Type errors
  UnsupportedTypeError,
  ConversionError,
  NullValueError,
  InvalidJsonError,
  ArithmeticOverflowError,
  StringTruncationError,

  // Constraint violations
  UniqueViolationError,
  PrimaryKeyViolationError,
  ForeignKeyViolationError,
  CheckViolationError,
  NullViolationError,

  // Object errors
  ObjectNotFoundError,
  ColumnNotFoundError,
  InvalidObjectNameError,

  // Syntax and permission errors
  SyntaxError,
  PermissionDeniedError,

  // Protocol errors
  ProtocolError,
  InvalidResponseError,

  // Simulation errors
  SimulationMismatchError,
  SimulatedError,
  RecordingNotFoundError,

  // Circuit breaker errors
  CircuitBreakerOpenError,

  // Error utilities
  parseSqlServerError,
  isSqlServerError,
  isRetryableError,
  getRetryDelayMs,
  getConstraintName,
  getTableName,
  getColumnName,
} from './errors/index.js';

// ============================================================================
// Configuration Exports
// ============================================================================

export {
  SqlServerConfig,
  validateSqlServerConfig,
  createDefaultConnectionConfig,
  createDefaultPoolConfig,
  parseConnectionString,
  toConnectionString,
  redactConfig,
  createConfigFromEnv,
} from './config/index.js';

// ============================================================================
// Connection Pool Exports
// ============================================================================

export {
  PooledConnection,
  HealthCheckResult,
  ConnectionPool,
  createConnectionPool,
} from './pool/index.js';

// ============================================================================
// Query Execution Exports
// ============================================================================

export {
  QueryParam as ExecutorQueryParam,
  FieldInfo,
  QueryResult as ExecutorQueryResult,
  QueryTarget,
  QueryOptions,
  ParameterDefinition,
  PreparedStatement,
  QueryExecutor,
} from './operations/query.js';

// ============================================================================
// Transaction Exports
// ============================================================================

export {
  TransactionOptions as TxOptions,
  SavepointImpl,
  Transaction as TransactionInstance,
  TransactionManager,
} from './operations/transaction.js';

// ============================================================================
// Bulk Operations Exports
// ============================================================================

export {
  BulkInsertResult,
  FailedRow,
  BulkInsertReport,
  BulkInsertBuilder,
  createBulkInsertBuilder,
} from './operations/bulk.js';

// ============================================================================
// Stored Procedure Exports
// ============================================================================

export {
  ProcedureCall,
  ProcedureResult,
  ProcedureOptions,
  TvpBuilder,
  ProcedureExecutor,
  tvp,
  isTvp,
} from './operations/procedure.js';

// ============================================================================
// Retry Logic Exports
// ============================================================================

export {
  RetryPolicy,
  RetryContext,
  DefaultRetryPolicy,
  DeadlockRetryPolicy,
  withRetry,
  withRetrySimple,
  isRetryableError as isRetryableErrorCheck,
  isDeadlockError,
  isLockTimeoutError,
  calculateBackoff,
  getRetryAfterMs as getRetryAfterMsFromError,
  createRetryPolicy,
} from './operations/retry.js';

// ============================================================================
// Observability Exports
// ============================================================================

export {
  // Logger
  LogLevel,
  Logger,
  ConsoleLogger,
  NoopLogger,
  LogEntry,
  InMemoryLogger,

  // Metrics
  MetricNames,
  MetricsCollector,
  NoopMetricsCollector,
  MetricEntry,
  InMemoryMetricsCollector,

  // Tracer
  SpanStatus,
  SpanContext,
  Tracer,
  NoopTracer,
  InMemorySpanContext,
  InMemoryTracer,

  // Observability container
  Observability,
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

// ============================================================================
// Resilience Exports
// ============================================================================

export {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
  createCircuitBreaker,
} from './resilience/index.js';

// ============================================================================
// Client Factory
// ============================================================================

import { SqlServerConfig, validateSqlServerConfig } from './config/index.js';
import { ConnectionPool, createConnectionPool } from './pool/index.js';
import { QueryExecutor, QueryTarget } from './operations/query.js';
import { TransactionManager } from './operations/transaction.js';
import { BulkInsertBuilder, createBulkInsertBuilder } from './operations/bulk.js';
import { ProcedureExecutor } from './operations/procedure.js';
import { Observability, createNoopObservability, createConsoleObservability, LogLevel } from './observability/index.js';

/**
 * SQL Server client options.
 */
export interface SqlServerClientOptions {
  /** SQL Server configuration */
  config: SqlServerConfig;
  /** Observability components (optional, defaults to console logging) */
  observability?: Observability;
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * SQL Server client providing a unified interface for all database operations.
 */
export class SqlServerClient {
  private readonly config: SqlServerConfig;
  private readonly observability: Observability;
  private readonly pool: ConnectionPool;
  private readonly queryExecutor: QueryExecutor;
  private readonly transactionManager: TransactionManager;
  private connected: boolean = false;

  /**
   * Creates a new SQL Server client.
   *
   * @param options - Client options
   */
  constructor(options: SqlServerClientOptions) {
    // Validate configuration
    validateSqlServerConfig(options.config);

    this.config = options.config;
    this.observability = options.observability ||
      (options.debug ? createConsoleObservability(LogLevel.DEBUG) : createConsoleObservability());

    // Create connection pool
    this.pool = createConnectionPool(this.config, this.observability);

    // Create query executor
    this.queryExecutor = new QueryExecutor(
      async (target?: QueryTarget) => {
        const role = target === 'replica' ? 'replica' : 'primary';
        return this.pool.acquire(role);
      },
      (conn) => this.pool.release(conn),
      this.observability
    );

    // Create transaction manager
    this.transactionManager = new TransactionManager(this.pool, this.observability);
  }

  /**
   * Connects to the database.
   *
   * Must be called before executing any queries.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.pool.connect();
    this.connected = true;

    this.observability.logger.info('SQL Server client connected', {
      host: this.config.primary.host,
      database: this.config.primary.database,
    });
  }

  /**
   * Closes the connection pool.
   */
  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.pool.close();
    this.connected = false;

    this.observability.logger.info('SQL Server client disconnected');
  }

  /**
   * Gets the query executor for executing queries.
   */
  get query(): QueryExecutor {
    return this.queryExecutor;
  }

  /**
   * Gets the transaction manager for managing transactions.
   */
  get transaction(): TransactionManager {
    return this.transactionManager;
  }

  /**
   * Gets the connection pool for advanced operations.
   */
  get connectionPool(): ConnectionPool {
    return this.pool;
  }

  /**
   * Executes a query and returns all rows.
   *
   * Convenience method that delegates to queryExecutor.execute().
   */
  async execute<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    return this.queryExecutor.executeMany<T>(query, params);
  }

  /**
   * Executes a query and returns a single row.
   *
   * Convenience method that delegates to queryExecutor.executeOne().
   */
  async executeOne<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T | null> {
    return this.queryExecutor.executeOne<T>(query, params);
  }

  /**
   * Executes a function within a transaction.
   *
   * Convenience method that delegates to transactionManager.withTransaction().
   */
  async withTransaction<T>(
    fn: (tx: import('./operations/transaction.js').Transaction) => Promise<T>,
    options?: import('./types/index.js').TransactionOptions
  ): Promise<T> {
    return this.transactionManager.withTransaction(fn, options);
  }

  /**
   * Performs a health check on the database connection.
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const result = await this.pool.healthCheck();
    return {
      healthy: result.healthy,
      latencyMs: result.latencyMs,
    };
  }

  /**
   * Gets connection pool statistics.
   */
  getPoolStats() {
    return this.pool.getStats();
  }

  /**
   * Creates a bulk insert builder for high-performance data insertion.
   *
   * @template T - Row type
   * @returns Bulk insert builder instance
   *
   * @example
   * ```typescript
   * const rows = [
   *   { name: 'Alice', email: 'alice@example.com', age: 30 },
   *   { name: 'Bob', email: 'bob@example.com', age: 25 }
   * ];
   *
   * const result = await client.bulkInsert()
   *   .table('users')
   *   .columns(['name', 'email', 'age'])
   *   .batchSize(5000)
   *   .tablock()
   *   .execute(rows);
   *
   * console.log(`Inserted ${result.rowsInserted} rows in ${result.duration}ms`);
   * ```
   */
  bulkInsert<T = Record<string, unknown>>(): BulkInsertBuilder<T> {
    return createBulkInsertBuilder<T>(
      async () => {
        return this.pool.acquire('primary');
      },
      (conn) => this.pool.release(conn),
      this.observability
    );
  }
}

/**
 * Creates a new SQL Server client.
 *
 * @param options - Client options
 * @returns SQL Server client instance
 *
 * @example
 * ```typescript
 * import { createClient } from '@llmdevops/sqlserver-integration';
 *
 * const client = createClient({
 *   config: {
 *     primary: {
 *       host: 'localhost',
 *       port: 1433,
 *       database: 'mydb',
 *       username: 'sa',
 *       password: 'password',
 *       authenticationType: 'sql-server',
 *       encryptionMode: 'require',
 *       trustServerCertificate: true,
 *       connectTimeout: 30000,
 *       requestTimeout: 30000,
 *       applicationName: 'my-app',
 *     },
 *     pool: {
 *       minConnections: 2,
 *       maxConnections: 10,
 *       acquireTimeout: 10000,
 *       idleTimeout: 600000,
 *       maxLifetime: 1800000,
 *       healthCheckInterval: 30000,
 *     },
 *   },
 * });
 *
 * await client.connect();
 *
 * // Execute queries
 * const users = await client.execute<User>('SELECT * FROM users');
 *
 * // Use transactions
 * await client.withTransaction(async (tx) => {
 *   await tx.execute('INSERT INTO users (name) VALUES (@name)', { name: 'John' });
 *   await tx.execute('INSERT INTO audit (action) VALUES (@action)', { action: 'user_created' });
 * });
 *
 * // Bulk insert operations
 * const rows = Array.from({ length: 10000 }, (_, i) => ({
 *   name: `User ${i}`,
 *   email: `user${i}@example.com`,
 * }));
 * const result = await client.bulkInsert()
 *   .table('users')
 *   .columns(['name', 'email'])
 *   .batchSize(5000)
 *   .execute(rows);
 *
 * await client.close();
 * ```
 */
export function createClient(options: SqlServerClientOptions): SqlServerClient {
  return new SqlServerClient(options);
}

// Default export
export default {
  createClient,
  SqlServerClient,
};
