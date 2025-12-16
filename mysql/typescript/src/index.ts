/**
 * MySQL Integration Module for LLM Dev Ops Platform
 *
 * Provides a complete MySQL client with connection pooling, read/write routing,
 * transaction management, prepared statements, observability, and resilience patterns.
 *
 * @module @llmdevops/mysql-integration
 * @version 1.0.0
 */

// ============================================================================
// Re-exports from submodules
// ============================================================================

// Types - selective exports to avoid conflicts
export type {
  SslMode,
  ConnectionConfig,
  PoolConfig,
  Value,
  ColumnMetadata,
  ColumnType,
  ColumnFlags,
  Row,
  ResultSet,
  ExecuteResult,
  IsolationLevel,
  Savepoint,
  TransactionOptions,
  Transaction,
  LoadBalanceStrategy,
  ReplicaEndpoint,
  ReplicaStatus,
  ColumnKey,
  ColumnInfo,
  TableInfo,
  IndexType,
  SortDirection,
  IndexColumn,
  IndexInfo,
  AccessType,
  ExplainResult,
  PoolStats,
  HealthStatus,
  Query,
  ConnectionState,
  Connection,
  PreparedStatement,
  QueryOptions,
  StreamOptions,
  RowStream,
  TableStats,
  ServerStatus,
  ProcessInfo,
} from './types/index.js';

export {
  validateConnectionConfig,
  validatePoolConfig,
  validateTransactionOptions,
  validateReplicaConfig,
  isNull,
  isBool,
  isInt,
  isUInt,
  isString,
  isJson,
  isDateTime,
  isDecimal,
  isBytes,
  createRow,
  extractValue,
  toValue,
  generateTransactionId,
  generateSavepointName,
} from './types/index.js';

// Errors - selective exports
export {
  MysqlErrorCode,
  MysqlError,
  ConnectionRefusedError,
  TooManyConnectionsError,
  ConnectionLostError,
  ServerGoneError,
  AcquireTimeoutError,
  PoolExhaustedError,
  AuthenticationFailedError,
  DatabaseNotFoundError,
  TableNotFoundError,
  SyntaxError,
  DuplicateKeyError,
  ForeignKeyViolationError,
  NotNullViolationError,
  DeadlockDetectedError,
  LockWaitTimeoutError,
  TransactionAbortedError,
  QueryTimeoutError,
  ParamCountMismatchError,
  ExecutionError,
  CircuitBreakerOpenError,
  isMysqlError,
  isRetryableError,
} from './errors/index.js';

export type {
  MysqlErrorResponse,
} from './errors/index.js';

// Configuration - selective exports to avoid conflicts
export {
  MysqlConfigBuilder,
  parseConnectionString,
  toConnectionString,
  createDefaultConnectionConfig,
  createDefaultPoolConfig,
  createDefaultReplicaEndpoint,
  createDefaultReplicaConfig,
  validateMysqlConfig,
  DEFAULT_MYSQL_PORT,
  DEFAULT_CHARSET,
  DEFAULT_COLLATION,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_VALIDATION_INTERVAL,
  DEFAULT_VALIDATION_QUERY,
  DEFAULT_QUERY_TIMEOUT,
  DEFAULT_MAX_QUERY_SIZE,
  DEFAULT_STREAM_BATCH_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_CIRCUIT_BREAKER_TIMEOUT,
  DEFAULT_LOG_QUERIES,
  DEFAULT_SLOW_QUERY_THRESHOLD,
  DEFAULT_AUTO_ROUTE_READS,
  DEFAULT_TRANSACTION_ON_PRIMARY,
  DEFAULT_REPLICA_WEIGHT,
  DEFAULT_REPLICA_PRIORITY,
  DEFAULT_MAX_REPLICA_LAG,
  DEFAULT_LOAD_BALANCE_STRATEGY,
} from './config/index.js';

export type {
  MysqlConfig,
  ReplicaConfig,
  ReplicaEndpoint as ConfigReplicaEndpoint,
} from './config/index.js';

// Pool
export {
  ConnectionPool,
  createConnectionPool,
} from './pool/index.js';

export type {
  PooledConnection,
  HealthCheckResult,
} from './pool/index.js';

// Routing
export {
  QueryRouter,
  LoadBalancer,
  StatementParser,
  StatementType,
  LoadBalancingStrategy,
} from './routing/index.js';

export type {
  RoutingConfig,
  ReplicaInfo,
  RouteDecision,
} from './routing/index.js';

// Simulation
export {
  MockMysqlClient,
  QueryRecorder,
  ReplayClient,
  normalizeQuery,
  matchesPattern,
} from './simulation/index.js';

export type {
  OperationType,
  SerializedError,
  RecordedOperation,
  MockTransaction,
  MockReplica,
  MockMetrics,
} from './simulation/index.js';

// Observability
export {
  LogLevel,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  MysqlMetricNames,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  SpanStatus,
  NoopTracer,
  InMemorySpanContext,
  InMemoryTracer,
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

export type {
  Logger,
  LogEntry,
  MetricsCollector,
  MetricEntry,
  Tracer,
  SpanContext,
  Observability,
} from './observability/index.js';

// Resilience
export {
  ExponentialBackoff,
  FixedBackoff,
  RetryExecutor,
  CircuitBreaker,
  CircuitBreakerState,
  RateLimiter,
  ResilienceOrchestrator,
  getRetryPolicy,
  DEFAULT_RETRY_POLICY,
  createPrimaryCircuitBreaker,
  createReplicaCircuitBreaker,
} from './resilience/index.js';

export type {
  BackoffStrategy,
  RetryPolicy,
  CircuitBreakerConfig,
  ResilienceOptions,
} from './resilience/index.js';

// ============================================================================
// Imports for MysqlClient
// ============================================================================

import type { Value, ResultSet, ExecuteResult, Row, TransactionOptions } from './types/index.js';
import type { MysqlConfig } from './config/index.js';
import { validateMysqlConfig } from './config/index.js';
import type { PooledConnection } from './pool/index.js';
import { ConnectionPool } from './pool/index.js';
import { QueryRouter, LoadBalancer, LoadBalancingStrategy } from './routing/index.js';
import type { Observability } from './observability/index.js';
import { LogLevel, createNoopObservability, createConsoleObservability } from './observability/index.js';
import type { ResilienceOptions } from './resilience/index.js';
import { ResilienceOrchestrator } from './resilience/index.js';

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for creating a MySQL client.
 */
export interface MysqlClientOptions {
  /** MySQL configuration */
  config: MysqlConfig;
  /** Observability components (optional - defaults to noop) */
  observability?: Observability;
  /** Resilience configuration (optional) */
  resilience?: ResilienceOptions;
}

// ============================================================================
// Health Status
// ============================================================================

/**
 * Health status for the MySQL client.
 */
export interface ClientHealthStatus {
  /** Overall health status */
  healthy: boolean;
  /** Primary database reachable */
  primaryHealthy: boolean;
  /** Replica health status */
  replicasHealthy: boolean[];
  /** Latency of health check in milliseconds */
  latencyMs: number;
}

// ============================================================================
// MySQL Client
// ============================================================================

/**
 * Main MySQL client providing unified access to all MySQL operations.
 *
 * The client manages:
 * - Connection pooling with automatic health checks
 * - Read/write query routing to primary and replicas
 * - Transaction management with savepoints
 * - Observability (logging, metrics, tracing)
 * - Resilience (retries, circuit breaker, rate limiting)
 *
 * @example
 * ```typescript
 * // Create client with configuration
 * const client = await createMysqlClient({
 *   config: new MysqlConfigBuilder()
 *     .withHost('localhost')
 *     .withPort(3306)
 *     .withDatabase('myapp')
 *     .withUsername('user')
 *     .withPassword('password')
 *     .build(),
 * });
 *
 * // Execute queries
 * const users = await client.query('SELECT * FROM users WHERE active = ?', [{ type: 'Bool', value: true }]);
 *
 * // Execute statements
 * const result = await client.execute(
 *   'INSERT INTO users (name, email) VALUES (?, ?)',
 *   [{ type: 'String', value: 'John' }, { type: 'String', value: 'john@example.com' }]
 * );
 *
 * // Clean up
 * await client.close();
 * ```
 */
export class MysqlClient {
  private readonly config: MysqlConfig;
  private readonly observability: Observability;
  private readonly pool: ConnectionPool;
  private readonly queryRouter: QueryRouter;
  private readonly loadBalancer: LoadBalancer;
  private readonly resilience?: ResilienceOrchestrator;
  private closed: boolean = false;

  /**
   * Creates a new MySQL client.
   *
   * Use the `createMysqlClient` factory function instead of calling this constructor directly.
   *
   * @param options - Client options
   */
  constructor(options: MysqlClientOptions) {
    this.config = options.config;

    // Validate configuration
    validateMysqlConfig(this.config);

    // Set up observability
    this.observability = options.observability ?? createNoopObservability();

    // Create connection pool with adapted config
    const poolConfig = this.adaptConfigForPool(this.config);
    const poolObservability = this.adaptObservabilityForPool(this.observability);
    this.pool = new ConnectionPool(poolConfig, poolObservability);

    // Create routing components
    const hasReplicas = (this.config.replica?.replicas.length ?? 0) > 0;
    this.queryRouter = new QueryRouter({
      autoRouteReads: this.config.autoRouteReads,
      maxReplicaLagMs: this.config.replica?.maxReplicaLagMs ?? 1000,
      hasReplicas,
    });

    // Map load balance strategy
    let lbStrategy = LoadBalancingStrategy.ROUND_ROBIN;
    if (this.config.replica?.loadBalanceStrategy === 'RANDOM') {
      lbStrategy = LoadBalancingStrategy.RANDOM;
    } else if (this.config.replica?.loadBalanceStrategy === 'LEAST_CONNECTIONS') {
      lbStrategy = LoadBalancingStrategy.LEAST_CONNECTIONS;
    } else if (this.config.replica?.loadBalanceStrategy === 'WEIGHTED_ROUND_ROBIN') {
      lbStrategy = LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN;
    }
    this.loadBalancer = new LoadBalancer(lbStrategy);

    // Set up resilience if configured
    if (options.resilience) {
      this.resilience = new ResilienceOrchestrator(options.resilience);
    }

    this.observability.logger.info('MySQL client initialized', {
      host: this.config.connection.host,
      database: this.config.connection.database,
      hasReplicas,
    });
  }

  /**
   * Adapts MysqlConfig to pool format.
   */
  private adaptConfigForPool(config: MysqlConfig): Parameters<typeof ConnectionPool.prototype.constructor>[0] {
    return {
      primary: {
        host: config.connection.host,
        port: config.connection.port,
        database: config.connection.database,
        username: config.connection.username,
        password: config.connection.password,
        charset: config.connection.charset,
        timezone: config.connection.timezone,
        ssl: config.connection.sslMode !== 'DISABLED' ? {
          ca: config.connection.sslCa,
          cert: config.connection.sslCert,
          key: config.connection.sslKey,
          rejectUnauthorized: config.connection.sslMode === 'VERIFY_CA' || config.connection.sslMode === 'VERIFY_IDENTITY',
        } : undefined,
        connectTimeout: config.connection.connectTimeout,
        applicationName: 'llmdevops-mysql',
      },
      replicas: config.replica?.replicas.map(r => ({
        host: r.config.host,
        port: r.config.port,
        database: r.config.database,
        username: r.config.username,
        password: r.config.password,
        charset: r.config.charset,
        timezone: r.config.timezone,
        ssl: r.config.sslMode !== 'DISABLED' ? {
          ca: r.config.sslCa,
          cert: r.config.sslCert,
          key: r.config.sslKey,
          rejectUnauthorized: r.config.sslMode === 'VERIFY_CA' || r.config.sslMode === 'VERIFY_IDENTITY',
        } : undefined,
        connectTimeout: r.config.connectTimeout,
        applicationName: 'llmdevops-mysql-replica',
      })),
      pool: {
        minConnections: config.pool.minConnections,
        maxConnections: config.pool.maxConnections,
        acquireTimeout: config.pool.acquireTimeout,
        idleTimeout: config.pool.idleTimeout,
        maxLifetime: config.pool.maxLifetime,
        healthCheckInterval: config.pool.validationInterval,
      },
    };
  }

  /**
   * Adapts Observability to pool format.
   */
  private adaptObservabilityForPool(obs: Observability): Parameters<typeof ConnectionPool.prototype.constructor>[1] {
    return {
      logger: {
        trace: (msg: string, ctx?: Record<string, unknown>) => obs.logger.debug(msg, ctx),
        debug: obs.logger.debug.bind(obs.logger),
        info: obs.logger.info.bind(obs.logger),
        warn: obs.logger.warn.bind(obs.logger),
        error: obs.logger.error.bind(obs.logger),
      },
      metrics: {
        increment: obs.metrics.increment.bind(obs.metrics),
        gauge: obs.metrics.gauge.bind(obs.metrics),
        timing: obs.metrics.timing.bind(obs.metrics),
      },
    };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Executes a SQL statement that modifies data (INSERT, UPDATE, DELETE).
   *
   * @param sql - SQL statement to execute
   * @param params - Query parameters
   * @returns Execution result with affected rows and last insert ID
   */
  async execute(sql: string, params: Value[] = []): Promise<ExecuteResult> {
    this.ensureNotClosed();

    const conn = await this.pool.acquire('primary');
    try {
      const startTime = Date.now();
      // Execute via connection - access the underlying mysql2 connection
      const [result] = await (conn as any).connection.execute(sql, this.convertParams(params));
      const duration = Date.now() - startTime;

      this.observability.metrics.timing('mysql_query_duration_ms', duration, { operation: 'execute' });

      const resultObj = result as { affectedRows?: number; insertId?: number | bigint };
      return {
        affectedRows: resultObj.affectedRows ?? 0,
        lastInsertId: typeof resultObj.insertId === 'bigint'
          ? Number(resultObj.insertId)
          : (resultObj.insertId ?? 0),
      };
    } finally {
      this.pool.release(conn);
    }
  }

  /**
   * Executes a SQL query and returns all rows.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @returns Result set containing all rows
   */
  async query(sql: string, params: Value[] = []): Promise<ResultSet> {
    this.ensureNotClosed();

    const routeDecision = this.queryRouter.getRouteDecision(sql, false);
    const role = routeDecision.target;
    const conn = await this.pool.acquire(role);
    try {
      const startTime = Date.now();
      const [rows, fields] = await (conn as any).connection.query(sql, this.convertParams(params));
      const duration = Date.now() - startTime;

      this.observability.metrics.timing('mysql_query_duration_ms', duration, { operation: 'query' });

      const rowsArray = Array.isArray(rows) ? rows : [];
      return {
        rows: rowsArray.map((row: unknown) => this.convertRow(row)),
        columns: Array.isArray(fields) ? fields.map((f: any) => ({
          name: f.name,
          columnType: f.type ?? 0,
          length: f.length ?? 0,
          flags: {},
          decimals: f.decimals ?? 0,
          charset: f.characterSet ?? 0,
          type: f.type ?? 0,
          maxLength: f.length ?? 0,
        })) : [],
        rowCount: rowsArray.length,
      };
    } finally {
      this.pool.release(conn);
    }
  }

  /**
   * Executes a SQL query and returns a single row or null.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @returns Single row or null if no rows returned
   */
  async queryOne(sql: string, params: Value[] = []): Promise<Row | null> {
    const result = await this.query(sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Executes multiple SQL statements in a batch.
   *
   * @param statements - Array of SQL statements with parameters
   * @returns Array of execution results
   */
  async executeBatch(
    statements: Array<{ sql: string; params?: Value[] }>
  ): Promise<ExecuteResult[]> {
    this.ensureNotClosed();

    const results: ExecuteResult[] = [];
    for (const stmt of statements) {
      const result = await this.execute(stmt.sql, stmt.params ?? []);
      results.push(result);
    }
    return results;
  }

  // ==========================================================================
  // Transaction Operations
  // ==========================================================================

  /**
   * Executes a function within a transaction with automatic commit/rollback.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns Result of the function
   */
  async withTransaction<T>(
    fn: (conn: PooledConnection) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    this.ensureNotClosed();

    const conn = await this.pool.acquire('primary');
    try {
      // Set isolation level if specified
      if (options?.isolationLevel) {
        await (conn as any).connection.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }

      // Begin transaction
      await (conn as any).connection.query('START TRANSACTION' + (options?.readOnly ? ' READ ONLY' : ''));

      try {
        const result = await fn(conn);
        await (conn as any).connection.query('COMMIT');
        return result;
      } catch (error) {
        await (conn as any).connection.query('ROLLBACK');
        throw error;
      }
    } finally {
      this.pool.release(conn);
    }
  }

  // ==========================================================================
  // Health Operations
  // ==========================================================================

  /**
   * Pings the database to check connectivity.
   *
   * @returns True if connection is healthy
   */
  async ping(): Promise<boolean> {
    this.ensureNotClosed();

    try {
      const conn = await this.pool.acquire('primary');
      try {
        await (conn as any).connection.query('SELECT 1');
        return true;
      } finally {
        this.pool.release(conn);
      }
    } catch {
      return false;
    }
  }

  /**
   * Performs a comprehensive health check.
   *
   * @returns Health status
   */
  async healthCheck(): Promise<ClientHealthStatus> {
    this.ensureNotClosed();

    const startTime = Date.now();
    const poolHealth = await this.pool.healthCheck();

    return {
      healthy: poolHealth.healthy,
      primaryHealthy: poolHealth.primaryReachable,
      replicasHealthy: poolHealth.replicasReachable,
      latencyMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // Connection Pool Operations
  // ==========================================================================

  /**
   * Gets current pool statistics.
   */
  getPoolStats() {
    this.ensureNotClosed();
    return this.pool.getStats();
  }

  /**
   * Acquires a connection from the pool.
   *
   * @param role - Connection role (primary or replica)
   * @returns Pooled connection
   */
  async acquireConnection(role: 'primary' | 'replica' = 'primary'): Promise<PooledConnection> {
    this.ensureNotClosed();
    return this.pool.acquire(role);
  }

  /**
   * Releases a connection back to the pool.
   *
   * @param connection - Connection to release
   * @param destroy - Whether to destroy the connection
   */
  releaseConnection(connection: PooledConnection, destroy: boolean = false): void {
    this.pool.release(connection, destroy);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Closes the client and releases all resources.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.observability.logger.info('Closing MySQL client');

    await this.pool.close();

    this.observability.logger.info('MySQL client closed');
  }

  /**
   * Returns whether the client has been closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureNotClosed(): void {
    if (this.closed) {
      throw new Error('MySQL client is closed');
    }
  }

  private convertParams(params: Value[]): unknown[] {
    return params.map(p => {
      switch (p.type) {
        case 'Null': return null;
        case 'Bool': return p.value;
        case 'Int': return p.value;
        case 'UInt': return p.value;
        case 'Float': return p.value;
        case 'String': return p.value;
        case 'Bytes': return Buffer.from(p.value);
        case 'DateTime': return p.value;
        case 'Date': return p.value;
        case 'Time': return p.value;
        case 'Timestamp': return p.value;
        case 'Decimal': return p.value;
        case 'Json': return JSON.stringify(p.value);
        default: return null;
      }
    });
  }

  private convertRow(row: unknown): Row {
    if (!row || typeof row !== 'object') {
      return { values: [], get: (key: string | number) => undefined };
    }

    const rowObj = row as Record<string, unknown>;
    const values: Value[] = Object.values(rowObj).map(v => this.toValue(v));

    return {
      values,
      get: (key: string | number) => {
        if (typeof key === 'number') {
          return values[key];
        }
        const val = rowObj[key];
        return val !== undefined ? this.toValue(val) : undefined;
      },
    };
  }

  private toValue(v: unknown): Value {
    if (v === null || v === undefined) {
      return { type: 'Null' };
    }
    if (typeof v === 'boolean') {
      return { type: 'Bool', value: v };
    }
    if (typeof v === 'number') {
      return Number.isInteger(v) ? { type: 'Int', value: v } : { type: 'Float', value: v };
    }
    if (typeof v === 'string') {
      return { type: 'String', value: v };
    }
    if (typeof v === 'bigint') {
      return { type: 'Int', value: Number(v) };
    }
    if (v instanceof Date) {
      return { type: 'DateTime', value: v };
    }
    if (Buffer.isBuffer(v)) {
      return { type: 'Bytes', value: new Uint8Array(v) };
    }
    if (v instanceof Uint8Array) {
      return { type: 'Bytes', value: v };
    }
    return { type: 'Json', value: v };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new MySQL client with the given options.
 *
 * @param options - Client options
 * @returns MySQL client instance
 */
export async function createMysqlClient(options: MysqlClientOptions): Promise<MysqlClient> {
  return new MysqlClient(options);
}

/**
 * Creates a MySQL integration with console observability.
 *
 * @param config - MySQL configuration
 * @returns MySQL client instance
 */
export async function createMysqlIntegration(config: MysqlConfig): Promise<MysqlClient> {
  return createMysqlClient({
    config,
    observability: createConsoleObservability(LogLevel.INFO),
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default MysqlClient;
