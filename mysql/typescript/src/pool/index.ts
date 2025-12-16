/**
 * Connection pool management for MySQL following SPARC specification.
 *
 * Provides connection pooling, health checks, metrics tracking, and lifecycle management
 * for MySQL connections using mysql2/promise package.
 *
 * @module pool
 */

import mysql from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  PoolOptions,
  RowDataPacket,
} from 'mysql2/promise';

/**
 * Observability interface for logger and metrics.
 */
export interface Observability {
  logger: {
    trace(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  metrics: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    gauge(name: string, value: number, tags?: Record<string, string>): void;
    timing(name: string, durationMs: number, tags?: Record<string, string>): void;
  };
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

/**
 * MySQL connection configuration.
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
  /** Database password (SENSITIVE - never logged) */
  password: string;
  /** Character set for the connection */
  charset?: string;
  /** Timezone for the connection */
  timezone?: string;
  /** SSL/TLS configuration */
  ssl?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Application name for connection tracking */
  applicationName?: string;
}

/**
 * MySQL configuration with pool settings.
 */
export interface MysqlConfig {
  /** Primary connection configuration */
  primary: ConnectionConfig;
  /** Replica connection configurations */
  replicas?: ConnectionConfig[];
  /** Pool configuration */
  pool: PoolConfig;
}

/**
 * Pooled connection with metadata and tracking.
 *
 * Wraps a mysql2.PoolConnection with additional tracking information for monitoring,
 * metrics, and connection lifecycle management.
 */
export interface PooledConnection {
  /** Unique connection identifier */
  id: string;
  /** Underlying mysql2.PoolConnection */
  connection: PoolConnection;
  /** When the connection was created */
  createdAt: Date;
  /** Last time the connection was used */
  lastUsedAt: Date;
  /** Number of queries executed on this connection */
  queryCount: number;
  /** Whether the connection is currently in a transaction */
  inTransaction: boolean;
  /** Connection role (primary or replica) */
  role: 'primary' | 'replica';
  /** Transaction nesting depth (for savepoints) */
  transactionDepth: number;
}

/**
 * Health check result for the connection pool.
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;
  /** Whether the primary is reachable */
  primaryReachable: boolean;
  /** Reachability status for each replica */
  replicasReachable: boolean[];
  /** Latency in milliseconds for health check */
  latencyMs: number;
}

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
 * Latency tracking for percentile calculations.
 *
 * Maintains a sliding window of latency samples and provides percentile
 * calculations for monitoring connection acquisition performance.
 */
class LatencyTracker {
  private latencies: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }

  /**
   * Records a latency sample.
   *
   * @param latencyMs - Latency value in milliseconds
   */
  record(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  /**
   * Calculates a percentile value.
   *
   * @param p - Percentile to calculate (0-100)
   * @returns Percentile value in milliseconds
   */
  percentile(p: number): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /**
   * Clears all recorded latencies.
   */
  clear(): void {
    this.latencies = [];
  }
}

/**
 * Connection pool implementation for MySQL.
 *
 * Manages a pool of connections to primary and replica databases with:
 * - Automatic connection validation and health checks
 * - Metrics tracking (acquire latency, query counts, etc.)
 * - Connection lifecycle management (max age, idle timeout)
 * - Read/write routing support
 * - Transaction state tracking
 * - Graceful shutdown with connection draining
 * - Pool exhaustion handling with backpressure
 */
export class ConnectionPool {
  private readonly config: MysqlConfig;
  private readonly observability: Observability;
  private readonly primaryPool: Pool;
  private readonly replicaPools: Pool[];
  private readonly connections: Map<string, PooledConnection>;
  private readonly acquireLatencyTracker: LatencyTracker;
  private nextConnectionId: number;
  private nextReplicaIndex: number;
  private closed: boolean;
  private healthCheckInterval?: NodeJS.Timeout;

  /**
   * Creates a new connection pool.
   *
   * @param config - MySQL configuration
   * @param observability - Observability components (logger, metrics)
   */
  constructor(config: MysqlConfig, observability: Observability) {
    this.config = config;
    this.observability = observability;
    this.connections = new Map();
    this.acquireLatencyTracker = new LatencyTracker();
    this.nextConnectionId = 1;
    this.nextReplicaIndex = 0;
    this.closed = false;

    // Create primary pool
    this.primaryPool = this.createPool(config.primary);
    this.observability.logger.info('Created primary connection pool', {
      host: config.primary.host,
      database: config.primary.database,
      maxConnections: config.pool.maxConnections,
    });

    // Create replica pools
    this.replicaPools = [];
    if (config.replicas && config.replicas.length > 0) {
      for (const replicaConfig of config.replicas) {
        const pool = this.createPool(replicaConfig);
        this.replicaPools.push(pool);
        this.observability.logger.info('Created replica connection pool', {
          host: replicaConfig.host,
          database: replicaConfig.database,
        });
      }
    }

    // Start health check interval if configured
    if (config.pool.healthCheckInterval > 0) {
      this.startHealthCheckInterval();
    }
  }

  /**
   * Creates a mysql2.Pool instance from connection configuration.
   *
   * @param connConfig - Connection configuration
   * @returns MySQL connection pool
   */
  private createPool(connConfig: ConnectionConfig): Pool {
    const poolOptions: PoolOptions = {
      host: connConfig.host,
      port: connConfig.port,
      database: connConfig.database,
      user: connConfig.username,
      password: connConfig.password,
      connectionLimit: this.config.pool.maxConnections,
      waitForConnections: true,
      queueLimit: 0, // Unlimited queue
      connectTimeout: connConfig.connectTimeout,
      charset: connConfig.charset || 'utf8mb4',
      timezone: connConfig.timezone || 'Z',
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    };

    // Configure SSL if provided
    if (connConfig.ssl) {
      poolOptions.ssl = {
        ca: connConfig.ssl.ca,
        cert: connConfig.ssl.cert,
        key: connConfig.ssl.key,
        rejectUnauthorized: connConfig.ssl.rejectUnauthorized ?? true,
      };
    }

    const pool = mysql.createPool(poolOptions);

    // Handle pool errors
    pool.on('connection', (connection) => {
      this.observability.logger.debug('New pool connection established');
    });

    return pool;
  }

  /**
   * Acquires a connection from the pool.
   *
   * Selects the appropriate pool based on the requested role and acquires
   * a connection with timeout handling. Validates the connection before
   * returning it to ensure it's usable.
   *
   * @param role - Connection role (primary or replica)
   * @returns A pooled connection
   * @throws {Error} If pool is closed, exhausted, or acquire times out
   */
  async acquire(role: 'primary' | 'replica' = 'primary'): Promise<PooledConnection> {
    if (this.closed) {
      throw new Error('Connection pool is closed');
    }

    const startTime = Date.now();
    const timeout = this.config.pool.acquireTimeout;

    try {
      const pool = this.selectPool(role);
      const connection = await this.acquireWithTimeout(pool, timeout);
      const latencyMs = Date.now() - startTime;

      // Track metrics
      this.acquireLatencyTracker.record(latencyMs);
      this.observability.metrics.timing(
        'mysql_pool_acquire_duration_seconds',
        latencyMs,
        { role }
      );
      this.observability.metrics.increment('mysql_routing_decisions_total', 1, {
        role,
      });

      // Validate connection
      await this.validateConnection(connection);

      // Create pooled connection wrapper
      const pooledConnection: PooledConnection = {
        id: this.generateConnectionId(),
        connection,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        queryCount: 0,
        inTransaction: false,
        role,
        transactionDepth: 0,
      };

      this.connections.set(pooledConnection.id, pooledConnection);

      this.observability.logger.debug('Acquired connection from pool', {
        connectionId: pooledConnection.id,
        role,
        latencyMs,
      });

      return pooledConnection;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (latencyMs >= timeout) {
        this.observability.logger.error('Connection acquire timeout', {
          timeoutMs: timeout,
          latencyMs,
          role,
        });
        throw new Error(`Timeout acquiring connection from pool after ${timeout}ms`);
      }

      this.observability.logger.error('Failed to acquire connection', {
        error: error instanceof Error ? error.message : String(error),
        role,
      });
      this.observability.metrics.increment('mysql_errors_total', 1, {
        type: 'acquire_failed',
        role,
      });

      throw new Error(
        `Failed to acquire connection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Releases a connection back to the pool.
   *
   * Performs transaction cleanup if the connection was released while in a
   * transaction (rolls back uncommitted changes). Checks connection lifetime
   * and destroys old connections.
   *
   * @param conn - Connection to release
   * @param destroy - Whether to destroy the connection instead of returning it to the pool
   */
  async release(conn: PooledConnection, destroy: boolean = false): Promise<void> {
    try {
      this.connections.delete(conn.id);

      // Check if connection is in a transaction and roll back
      if (conn.inTransaction || conn.transactionDepth > 0) {
        this.observability.logger.error(
          'Connection released with open transaction, rolling back',
          {
            connectionId: conn.id,
            transactionDepth: conn.transactionDepth,
          }
        );
        try {
          await conn.connection.rollback();
          conn.inTransaction = false;
          conn.transactionDepth = 0;
        } catch (rollbackError) {
          this.observability.logger.error('Failed to rollback transaction on release', {
            connectionId: conn.id,
            error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          });
          // Force destroy if rollback fails
          destroy = true;
        }
      }

      // Check max lifetime
      const age = Date.now() - conn.createdAt.getTime();
      if (age > this.config.pool.maxLifetime) {
        this.observability.logger.debug('Connection exceeded max lifetime, destroying', {
          connectionId: conn.id,
          ageMs: age,
          maxLifetimeMs: this.config.pool.maxLifetime,
        });
        destroy = true;
      }

      if (destroy) {
        // Destroy the connection
        conn.connection.destroy();
        this.observability.logger.debug('Destroyed connection', {
          connectionId: conn.id,
        });
      } else {
        // Return the connection to the pool
        conn.connection.release();
        this.observability.logger.debug('Released connection to pool', {
          connectionId: conn.id,
          queryCount: conn.queryCount,
        });
      }
    } catch (error) {
      this.observability.logger.error('Error releasing connection', {
        connectionId: conn.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Executes a function with an automatically managed connection.
   *
   * The connection is acquired before the function executes and released
   * after it completes, even if an error occurs. Connections are destroyed
   * on error to ensure clean state.
   *
   * @param fn - Function to execute with the connection
   * @param role - Connection role (primary or replica)
   * @returns Result of the function
   */
  async withConnection<T>(
    fn: (conn: PooledConnection) => Promise<T>,
    role: 'primary' | 'replica' = 'primary'
  ): Promise<T> {
    const conn = await this.acquire(role);
    try {
      const result = await fn(conn);
      await this.release(conn);
      return result;
    } catch (error) {
      // Destroy the connection if there was an error
      await this.release(conn, true);
      throw error;
    }
  }

  /**
   * Gets current pool statistics.
   *
   * Aggregates statistics from primary and replica pools including total
   * connections, idle connections, active connections, and waiting requests.
   *
   * @returns Pool statistics with latency percentiles
   */
  getStats(): PoolStats & {
    acquireLatencyP50: number;
    acquireLatencyP99: number;
  } {
    // Note: mysql2 doesn't expose pool stats directly, so we track via our connections map
    const activeConnections = this.connections.size;

    // Estimate total and idle based on configured limits
    const totalConnections = this.config.pool.maxConnections;
    const idleConnections = Math.max(0, totalConnections - activeConnections);

    return {
      totalConnections,
      idleConnections,
      activeConnections,
      waitingRequests: 0, // mysql2 doesn't expose this
      acquireLatencyP50: this.acquireLatencyTracker.percentile(50),
      acquireLatencyP99: this.acquireLatencyTracker.percentile(99),
    };
  }

  /**
   * Performs a health check on all pools.
   *
   * Executes a simple SELECT 1 query on primary and all replicas to verify
   * connectivity and measure latency.
   *
   * @returns Health check result
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    // Check primary
    const primaryReachable = await this.checkPoolHealth(this.primaryPool);

    // Check replicas
    const replicasReachable: boolean[] = [];
    for (const pool of this.replicaPools) {
      const reachable = await this.checkPoolHealth(pool);
      replicasReachable.push(reachable);
    }

    const latencyMs = Date.now() - startTime;
    const healthy = primaryReachable && replicasReachable.every((r) => r);

    this.observability.logger.debug('Health check completed', {
      healthy,
      primaryReachable,
      replicasReachable,
      latencyMs,
    });

    this.observability.metrics.gauge('mysql_pool_healthy', healthy ? 1 : 0);

    return {
      healthy,
      primaryReachable,
      replicasReachable,
      latencyMs,
    };
  }

  /**
   * Closes the pool and all connections.
   *
   * Performs graceful shutdown by:
   * 1. Marking the pool as closed to reject new requests
   * 2. Rolling back any active transactions
   * 3. Releasing all tracked connections
   * 4. Ending all underlying mysql2 pools
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Stop health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.observability.logger.info('Closing connection pool', {
      activeConnections: this.connections.size,
    });

    // Release all tracked connections
    const connectionsToRelease = Array.from(this.connections.values());
    for (const conn of connectionsToRelease) {
      await this.release(conn);
    }

    // End all pools
    await Promise.all([
      this.primaryPool.end(),
      ...this.replicaPools.map((pool) => pool.end()),
    ]);

    this.observability.logger.info('Connection pool closed');
  }

  /**
   * Selects a pool based on the requested role.
   *
   * For primary role or when no replicas are available, returns the primary pool.
   * For replica role, uses round-robin selection across available replicas.
   *
   * @param role - Requested connection role
   * @returns Selected MySQL pool
   */
  private selectPool(role: 'primary' | 'replica'): Pool {
    if (role === 'primary' || this.replicaPools.length === 0) {
      return this.primaryPool;
    }

    // Round-robin selection for replicas
    const pool = this.replicaPools[this.nextReplicaIndex];
    this.nextReplicaIndex = (this.nextReplicaIndex + 1) % this.replicaPools.length;

    if (!pool) {
      // Fallback to primary if replica selection fails
      this.observability.logger.warn('Replica selection failed, using primary');
      return this.primaryPool;
    }

    return pool;
  }

  /**
   * Acquires a connection from a pool with timeout.
   *
   * Wraps the mysql2 pool.getConnection() with a timeout to prevent
   * indefinite waiting during pool exhaustion or connection issues.
   *
   * @param pool - MySQL pool to acquire from
   * @param timeoutMs - Timeout in milliseconds
   * @returns Pool connection
   * @throws {Error} If timeout is exceeded
   */
  private async acquireWithTimeout(
    pool: Pool,
    timeoutMs: number
  ): Promise<PoolConnection> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout acquiring connection after ${timeoutMs}ms`));
      }, timeoutMs);

      pool
        .getConnection()
        .then((connection) => {
          clearTimeout(timer);
          resolve(connection);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Validates a connection by executing a simple query.
   *
   * Uses SELECT 1 to verify the connection is alive and responsive.
   * This is MySQL-specific and ensures the connection hasn't been
   * terminated by the server.
   *
   * @param connection - Connection to validate
   * @throws {Error} If validation fails
   */
  private async validateConnection(connection: PoolConnection): Promise<void> {
    try {
      await connection.query('SELECT 1');
    } catch (error) {
      throw new Error(
        `Connection validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Checks the health of a specific pool.
   *
   * Attempts to acquire a connection and execute a simple query.
   * Returns false if any step fails, indicating the pool is unhealthy.
   *
   * @param pool - MySQL pool to check
   * @returns True if pool is healthy, false otherwise
   */
  private async checkPoolHealth(pool: Pool): Promise<boolean> {
    let connection: PoolConnection | null = null;
    try {
      connection = await pool.getConnection();
      await connection.query('SELECT 1');
      return true;
    } catch (error) {
      this.observability.logger.warn('Pool health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Starts periodic health check interval.
   *
   * Runs health checks at the configured interval and updates metrics.
   * Errors during health checks are logged but don't stop the interval.
   */
  private startHealthCheckInterval(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const result = await this.healthCheck();
        this.observability.metrics.gauge('mysql_pool_healthy', result.healthy ? 1 : 0);
      } catch (error) {
        this.observability.logger.error('Health check interval error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.pool.healthCheckInterval);
  }

  /**
   * Generates a unique connection ID.
   *
   * Uses an incrementing counter with a prefix for easy identification
   * in logs and metrics.
   *
   * @returns Unique connection identifier
   */
  private generateConnectionId(): string {
    return `conn_${this.nextConnectionId++}`;
  }
}

/**
 * Creates a connection pool with the provided configuration.
 *
 * Helper function that creates a connection pool instance with
 * proper observability setup.
 *
 * @param config - MySQL configuration
 * @param observability - Observability components
 * @returns Connection pool instance
 */
export function createConnectionPool(
  config: MysqlConfig,
  observability: Observability
): ConnectionPool {
  return new ConnectionPool(config, observability);
}
