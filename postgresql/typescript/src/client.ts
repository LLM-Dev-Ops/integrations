/**
 * PostgreSQL client implementation following SPARC specification.
 *
 * Main entry point for the PostgreSQL integration, providing a unified interface
 * for connection management, query execution, transactions, and routing.
 *
 * @module client
 */

import type { PoolClient } from 'pg';
import { ConnectionPool, PooledConnection, HealthCheckResult } from './pool/index.js';
import { QueryExecutor, QueryResult, QueryOptions, QueryTarget, QueryParam } from './operations/query.js';
import { TransactionManager, Transaction, TransactionOptions } from './operations/transaction.js';
import { QueryRouter, RoutingPolicy, RoutingDecision, RouteOptions, RoutingConfig } from './router/index.js';
import { PgConfig, validatePgConfig } from './config/index.js';
import { IsolationLevel, PoolStats, SslMode } from './types/index.js';
import { PgError, PgErrorCode } from './errors/index.js';
import {
  Observability,
  createNoopObservability,
  createConsoleObservability,
  LogLevel,
} from './observability/index.js';
import { ResilienceOrchestrator, RetryConfig, CircuitBreakerConfig, CircuitBreakerState, DEFAULT_RETRY_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './resilience/index.js';
import {
  SimulationMode,
  SimulationInterceptor,
  RecordingStore,
  InMemoryRecordingStore,
} from './simulation/index.js';

// Re-export QueryParam from query module for convenience
export type { QueryParam };

/**
 * PostgreSQL client options.
 */
export interface PgClientOptions {
  /** PostgreSQL configuration */
  config: PgConfig;
  /** Observability components (optional, defaults to noop) */
  observability?: Observability;
  /** Retry configuration (optional) */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration (optional) */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Simulation mode (optional, defaults to Off) */
  simulationMode?: SimulationMode;
  /** Recording store for simulation mode (optional) */
  recordingStore?: RecordingStore;
  /** Routing configuration (optional) */
  routing?: Partial<RoutingConfig>;
}

/**
 * PostgreSQL client providing a unified interface for database operations.
 *
 * Features:
 * - Connection pooling with automatic health checks
 * - Query execution with parameterized queries
 * - Transaction management with isolation levels
 * - Read/write routing with multiple policies
 * - Resilience patterns (retry, circuit breaker)
 * - Comprehensive observability (logging, metrics, tracing)
 * - Simulation mode for testing
 */
export class PgClient {
  private readonly config: PgConfig;
  private readonly observability: Observability;
  private readonly pool: ConnectionPool;
  private readonly queryExecutor: QueryExecutor;
  private readonly transactionManager: TransactionManager;
  private readonly router: QueryRouter;
  private readonly resilience?: ResilienceOrchestrator;
  private readonly simulation?: SimulationInterceptor;
  private closed = false;

  /**
   * Creates a new PostgreSQL client.
   *
   * @param options - Client configuration options
   */
  constructor(options: PgClientOptions) {
    // Validate configuration
    validatePgConfig(options.config);

    this.config = options.config;
    this.observability = options.observability ?? createNoopObservability();

    // Initialize connection pool
    this.pool = new ConnectionPool(this.config, this.observability);

    // Create adapter for router's ConnectionPool interface
    const routerPool = {
      getReplicaCount: () => this.config.replicas?.length ?? 0,
      getReplicaConnections: () => 0, // Simple implementation
    };

    // Initialize query router
    this.router = new QueryRouter(routerPool, options.routing);

    // Initialize query executor
    this.queryExecutor = new QueryExecutor(
      async (target?: QueryTarget): Promise<PoolClient> => {
        const role = target === 'primary' ? 'primary' : 'replica';
        const conn = await this.pool.acquire(role);
        return conn.client;
      },
      (client: PoolClient) => {
        client.release();
      },
      this.observability
    );

    // Initialize transaction manager
    this.transactionManager = new TransactionManager(this.pool, this.observability);

    // Initialize resilience orchestrator if configured
    if (options.retry || options.circuitBreaker) {
      this.resilience = new ResilienceOrchestrator(
        { ...DEFAULT_RETRY_CONFIG, ...options.retry },
        { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...options.circuitBreaker },
        this.observability
      );
    }

    // Initialize simulation interceptor if configured
    if (options.simulationMode && options.simulationMode !== SimulationMode.Off) {
      const store = options.recordingStore ?? new InMemoryRecordingStore();
      this.simulation = new SimulationInterceptor(
        options.simulationMode,
        store,
        this.observability.logger
      );
    }

    this.observability.logger.info('PostgreSQL client initialized', {
      host: this.config.primary.host,
      database: this.config.primary.database,
      replicaCount: this.config.replicas?.length ?? 0,
    });
  }

  // ==========================================================================
  // Query Execution
  // ==========================================================================

  /**
   * Executes a SQL query and returns the full result.
   *
   * @param sql - SQL query text with $1, $2, etc. placeholders
   * @param params - Query parameters
   * @param options - Query options (timeout, target)
   * @returns Query result with rows and metadata
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: QueryParam[] = [],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    this.ensureOpen();

    const execute = () => this.queryExecutor.execute<T>(sql, params, options);

    if (this.simulation) {
      return this.simulation.intercept(sql, params, execute);
    }

    if (this.resilience) {
      return this.resilience.execute(execute, 'query');
    }

    return execute();
  }

  /**
   * Executes a query and returns a single row or null.
   *
   * @param sql - SQL query text
   * @param params - Query parameters
   * @param options - Query options
   * @returns Single row or null if no rows
   * @throws {TooManyRowsError} If more than one row returned
   */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: QueryParam[] = [],
    options?: QueryOptions
  ): Promise<T | null> {
    this.ensureOpen();

    const execute = () => this.queryExecutor.executeOne<T>(sql, params, options);

    if (this.resilience) {
      return this.resilience.execute(execute, 'queryOne');
    }

    return execute();
  }

  /**
   * Executes a query and returns a single row, throwing if not found.
   *
   * @param sql - SQL query text
   * @param params - Query parameters
   * @param options - Query options
   * @returns Single row
   * @throws {NoRowsError} If no rows returned
   * @throws {TooManyRowsError} If more than one row returned
   */
  async queryOneRequired<T = Record<string, unknown>>(
    sql: string,
    params: QueryParam[] = [],
    options?: QueryOptions
  ): Promise<T> {
    this.ensureOpen();

    const execute = () => this.queryExecutor.executeOneRequired<T>(sql, params, options);

    if (this.resilience) {
      return this.resilience.execute(execute, 'queryOneRequired');
    }

    return execute();
  }

  /**
   * Executes a query and returns an array of rows.
   *
   * @param sql - SQL query text
   * @param params - Query parameters
   * @param options - Query options
   * @returns Array of rows
   */
  async queryMany<T = Record<string, unknown>>(
    sql: string,
    params: QueryParam[] = [],
    options?: QueryOptions
  ): Promise<T[]> {
    this.ensureOpen();

    const execute = () => this.queryExecutor.executeMany<T>(sql, params, options);

    if (this.resilience) {
      return this.resilience.execute(execute, 'queryMany');
    }

    return execute();
  }

  /**
   * Streams query results for large result sets.
   *
   * @param sql - SQL query text
   * @param params - Query parameters
   * @param options - Query options
   * @returns Async iterator of rows
   */
  stream<T = Record<string, unknown>>(
    sql: string,
    params: QueryParam[] = [],
    options?: QueryOptions
  ): AsyncIterable<T> {
    this.ensureOpen();
    return this.queryExecutor.stream<T>(sql, params, options);
  }

  // ==========================================================================
  // Transaction Management
  // ==========================================================================

  /**
   * Begins a new transaction.
   *
   * @param options - Transaction options
   * @returns Active transaction
   */
  async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    this.ensureOpen();
    return this.transactionManager.begin(options);
  }

  /**
   * Executes a function within a transaction.
   *
   * The transaction is automatically committed if the function completes successfully,
   * or rolled back if an error is thrown.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns Result of the function
   */
  async withTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    this.ensureOpen();
    return this.transactionManager.withTransaction(fn, options);
  }

  // ==========================================================================
  // Routing
  // ==========================================================================

  /**
   * Routes a query based on the configured routing policy.
   *
   * @param sql - SQL query text
   * @param options - Routing options
   * @returns Routing decision
   */
  route(sql: string, options?: RouteOptions): RoutingDecision {
    return this.router.route(sql, options);
  }

  // ==========================================================================
  // Health & Statistics
  // ==========================================================================

  /**
   * Performs a health check on all connection pools.
   *
   * @returns Health check result
   */
  async healthCheck(): Promise<HealthCheckResult> {
    this.ensureOpen();
    return this.pool.healthCheck();
  }

  /**
   * Gets connection pool statistics.
   *
   * @returns Pool statistics
   */
  getPoolStats(): PoolStats {
    return this.pool.getStats();
  }

  /**
   * Gets the current circuit breaker state.
   *
   * @returns Circuit breaker state or undefined if not configured
   */
  getCircuitBreakerState(): CircuitBreakerState | undefined {
    return this.resilience?.getCircuitBreakerState();
  }

  /**
   * Resets the circuit breaker to closed state.
   */
  resetCircuitBreaker(): void {
    this.resilience?.resetCircuitBreaker();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Closes the client and releases all resources.
   *
   * This method should be called when the client is no longer needed.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    this.observability.logger.info('Closing PostgreSQL client');

    try {
      await this.pool.close();
      this.observability.logger.info('PostgreSQL client closed');
    } catch (error) {
      this.observability.logger.error('Error closing PostgreSQL client', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Returns whether the client is closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensures the client is open.
   */
  private ensureOpen(): void {
    if (this.closed) {
      throw new PgError({
        code: PgErrorCode.ConnectionFailed,
        message: 'PostgreSQL client is closed',
        retryable: false,
      });
    }
  }
}

/**
 * Creates a PostgreSQL client with the given options.
 *
 * @param options - Client options
 * @returns Configured PostgreSQL client
 */
export function createPgClient(options: PgClientOptions): PgClient {
  return new PgClient(options);
}

/**
 * Creates a PostgreSQL client from environment variables.
 *
 * Environment variables:
 * - PGHOST: Database host
 * - PGPORT: Database port (default: 5432)
 * - PGDATABASE: Database name
 * - PGUSER: Username
 * - PGPASSWORD: Password
 * - PG_SSL_MODE: SSL mode (disable, prefer, require, verify-ca, verify-full)
 * - PG_REPLICA_HOSTS: Comma-separated list of replica hosts
 * - PG_LOG_LEVEL: Log level (trace, debug, info, warn, error)
 *
 * @returns Configured PostgreSQL client
 * @throws {ConfigurationError} If required environment variables are missing
 */
export function createPgClientFromEnv(): PgClient {
  const host = process.env.PGHOST;
  const port = parseInt(process.env.PGPORT ?? '5432', 10);
  const database = process.env.PGDATABASE;
  const username = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!host || !database || !username || !password) {
    throw new PgError({
      code: PgErrorCode.ConfigurationError,
      message: 'Missing required environment variables: PGHOST, PGDATABASE, PGUSER, PGPASSWORD',
      retryable: false,
    });
  }

  // Parse SSL mode
  const sslModeStr = process.env.PG_SSL_MODE ?? 'prefer';
  const sslModeMap: Record<string, SslMode> = {
    disable: SslMode.Disable,
    prefer: SslMode.Prefer,
    require: SslMode.Require,
    'verify-ca': SslMode.VerifyCa,
    'verify-full': SslMode.VerifyFull,
  };
  const sslMode = sslModeMap[sslModeStr] ?? SslMode.Prefer;

  // Parse replica hosts
  const replicaHosts = process.env.PG_REPLICA_HOSTS?.split(',').filter(h => h.trim());
  const replicas = replicaHosts?.map(h => ({
    host: h.trim(),
    port,
    database,
    username,
    password,
    sslMode,
    connectTimeout: 10000,
    applicationName: 'llmdevops-postgresql',
  }));

  // Parse log level
  const logLevelStr = process.env.PG_LOG_LEVEL?.toLowerCase() ?? 'info';
  const logLevel = {
    trace: LogLevel.TRACE,
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  }[logLevelStr] ?? LogLevel.INFO;

  const config: PgConfig = {
    primary: {
      host,
      port,
      database,
      username,
      password,
      sslMode,
      connectTimeout: 10000,
      applicationName: 'llmdevops-postgresql',
    },
    replicas,
    pool: {
      minConnections: parseInt(process.env.PG_POOL_MIN ?? '2', 10),
      maxConnections: parseInt(process.env.PG_POOL_MAX ?? '10', 10),
      acquireTimeout: parseInt(process.env.PG_ACQUIRE_TIMEOUT ?? '30000', 10),
      idleTimeout: parseInt(process.env.PG_IDLE_TIMEOUT ?? '10000', 10),
      maxLifetime: parseInt(process.env.PG_MAX_LIFETIME ?? '1800000', 10),
      healthCheckInterval: parseInt(process.env.PG_HEALTH_CHECK_INTERVAL ?? '30000', 10),
    },
    queryTimeout: parseInt(process.env.PG_QUERY_TIMEOUT ?? '30000', 10),
  };

  return new PgClient({
    config,
    observability: createConsoleObservability(logLevel),
  });
}
