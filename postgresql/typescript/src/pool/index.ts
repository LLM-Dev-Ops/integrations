/**
 * Connection pool management for PostgreSQL following SPARC specification.
 *
 * Provides connection pooling, health checks, metrics tracking, and lifecycle management
 * for PostgreSQL connections using pg and pg-pool packages.
 *
 * @module pool
 */

import { Pool, PoolClient, PoolConfig as PgPoolConfig } from 'pg';
import { PgConfig } from '../config/index.js';
import { ConnectionConfig, QueryIntent, PoolStats } from '../types/index.js';
import {
  PgError,
  PgErrorCode,
  ConnectionFailedError,
  AcquireTimeoutError,
  PoolExhaustedError,
} from '../errors/index.js';
import { Observability, MetricNames } from '../observability/index.js';

/**
 * Pooled connection with metadata and tracking.
 *
 * Wraps a pg.PoolClient with additional tracking information for monitoring,
 * metrics, and connection lifecycle management.
 */
export interface PooledConnection {
  /** Unique connection identifier */
  id: string;
  /** Underlying pg.PoolClient */
  client: PoolClient;
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
 * Latency tracking for percentile calculations.
 */
class LatencyTracker {
  private latencies: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }

  /**
   * Records a latency sample.
   */
  record(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  /**
   * Calculates a percentile value.
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
 * Connection pool implementation for PostgreSQL.
 *
 * Manages a pool of connections to primary and replica databases with:
 * - Automatic connection validation and health checks
 * - Metrics tracking (acquire latency, query counts, etc.)
 * - Connection lifecycle management (max age, idle timeout)
 * - Read/write routing support
 * - Graceful shutdown with connection draining
 */
export class ConnectionPool {
  private readonly config: PgConfig;
  private readonly observability: Observability;
  private readonly primaryPool: Pool;
  private readonly replicaPools: Pool[];
  private readonly connections: Map<string, PooledConnection>;
  private readonly acquireLatencyTracker: LatencyTracker;
  private nextConnectionId: number;
  private closed: boolean;
  private healthCheckInterval?: NodeJS.Timeout;

  /**
   * Creates a new connection pool.
   *
   * @param config - PostgreSQL configuration
   * @param observability - Observability components (logger, metrics, tracer)
   */
  constructor(config: PgConfig, observability: Observability) {
    this.config = config;
    this.observability = observability;
    this.connections = new Map();
    this.acquireLatencyTracker = new LatencyTracker();
    this.nextConnectionId = 1;
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
   * Creates a pg.Pool instance from connection configuration.
   */
  private createPool(connConfig: ConnectionConfig): Pool {
    const poolConfig: PgPoolConfig = {
      host: connConfig.host,
      port: connConfig.port,
      database: connConfig.database,
      user: connConfig.username,
      password: connConfig.password,
      min: this.config.pool.minConnections,
      max: this.config.pool.maxConnections,
      idleTimeoutMillis: this.config.pool.idleTimeout,
      connectionTimeoutMillis: connConfig.connectTimeout,
      application_name: connConfig.applicationName,
    };

    // Configure SSL
    if (connConfig.sslMode !== 'disable') {
      poolConfig.ssl =
        connConfig.sslMode === 'require' ||
        connConfig.sslMode === 'verify-ca' ||
        connConfig.sslMode === 'verify-full'
          ? {
              rejectUnauthorized: connConfig.sslMode === 'verify-full',
              ca: connConfig.sslCert,
            }
          : false;
    }

    const pool = new Pool(poolConfig);

    // Handle pool errors
    pool.on('error', (err, client) => {
      this.observability.logger.error('Unexpected pool error', {
        error: err.message,
        stack: err.stack,
      });
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        type: 'pool_error',
      });
    });

    // Handle connection events
    pool.on('connect', client => {
      this.observability.logger.debug('New pool connection established');
      this.observability.metrics.gauge(
        MetricNames.POOL_CONNECTIONS,
        pool.totalCount,
        { state: 'total' }
      );
    });

    pool.on('remove', client => {
      this.observability.logger.debug('Pool connection removed');
      this.observability.metrics.gauge(
        MetricNames.POOL_CONNECTIONS,
        pool.totalCount,
        { state: 'total' }
      );
    });

    return pool;
  }

  /**
   * Acquires a connection from the pool.
   *
   * @param role - Connection role (primary or replica)
   * @returns A pooled connection
   * @throws {PgError} If pool is closed, exhausted, or acquire times out
   */
  async acquire(role: 'primary' | 'replica' = 'primary'): Promise<PooledConnection> {
    if (this.closed) {
      throw new PgError({
        code: PgErrorCode.ConnectionFailed,
        message: 'Connection pool is closed',
        retryable: false,
      });
    }

    const startTime = Date.now();
    const timeout = this.config.pool.acquireTimeout;

    try {
      const pool = this.selectPool(role);
      const client = await this.acquireWithTimeout(pool, timeout);
      const latencyMs = Date.now() - startTime;

      // Track metrics
      this.acquireLatencyTracker.record(latencyMs);
      this.observability.metrics.timing(
        MetricNames.POOL_ACQUIRE_DURATION_SECONDS,
        latencyMs,
        { role }
      );
      this.observability.metrics.increment(MetricNames.ROUTING_DECISIONS_TOTAL, 1, {
        role,
      });

      // Validate connection
      await this.validateConnection(client);

      // Create pooled connection wrapper
      const pooledConnection: PooledConnection = {
        id: this.generateConnectionId(),
        client,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        queryCount: 0,
        inTransaction: false,
        role,
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
        throw new AcquireTimeoutError(timeout);
      }

      this.observability.logger.error('Failed to acquire connection', {
        error: error instanceof Error ? error.message : String(error),
        role,
      });
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        type: 'acquire_failed',
        role,
      });

      throw new PgError({
        code: PgErrorCode.ConnectionFailed,
        message: `Failed to acquire connection: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
        cause: error as Error,
      });
    }
  }

  /**
   * Releases a connection back to the pool.
   *
   * @param conn - Connection to release
   * @param destroy - Whether to destroy the connection instead of returning it to the pool
   */
  release(conn: PooledConnection, destroy: boolean = false): void {
    try {
      this.connections.delete(conn.id);

      if (destroy) {
        // Remove the client from the pool completely
        conn.client.release(true);
        this.observability.logger.debug('Destroyed connection', {
          connectionId: conn.id,
        });
      } else {
        // Return the client to the pool
        conn.client.release();
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
   * after it completes, even if an error occurs.
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
      this.release(conn);
      return result;
    } catch (error) {
      // Destroy the connection if there was an error
      this.release(conn, true);
      throw error;
    }
  }

  /**
   * Gets current pool statistics.
   *
   * @returns Pool statistics
   */
  getStats(): PoolStats & {
    acquireLatencyP50: number;
    acquireLatencyP99: number;
  } {
    const primaryStats = {
      total: this.primaryPool.totalCount,
      idle: this.primaryPool.idleCount,
      waiting: this.primaryPool.waitingCount,
    };

    const replicaStats = this.replicaPools.map(pool => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }));

    const totalConnections =
      primaryStats.total + replicaStats.reduce((sum, s) => sum + s.total, 0);
    const idleConnections =
      primaryStats.idle + replicaStats.reduce((sum, s) => sum + s.idle, 0);
    const waitingRequests =
      primaryStats.waiting + replicaStats.reduce((sum, s) => sum + s.waiting, 0);

    return {
      totalConnections,
      idleConnections,
      activeConnections: totalConnections - idleConnections,
      waitingRequests,
      acquireLatencyP50: this.acquireLatencyTracker.percentile(50),
      acquireLatencyP99: this.acquireLatencyTracker.percentile(99),
    };
  }

  /**
   * Performs a health check on all pools.
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
    const healthy = primaryReachable && replicasReachable.every(r => r);

    this.observability.logger.debug('Health check completed', {
      healthy,
      primaryReachable,
      replicasReachable,
      latencyMs,
    });

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
   * Performs graceful shutdown by waiting for all active connections to be released.
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
      this.release(conn);
    }

    // End all pools
    await Promise.all([
      this.primaryPool.end(),
      ...this.replicaPools.map(pool => pool.end()),
    ]);

    this.observability.logger.info('Connection pool closed');
  }

  /**
   * Selects a pool based on the requested role.
   */
  private selectPool(role: 'primary' | 'replica'): Pool {
    if (role === 'primary' || this.replicaPools.length === 0) {
      return this.primaryPool;
    }

    // Simple round-robin selection for replicas
    // In production, this could be enhanced with least-connections or other strategies
    const index = Math.floor(Math.random() * this.replicaPools.length);
    const pool = this.replicaPools[index];
    if (!pool) {
      // Fallback to primary if replica selection fails
      return this.primaryPool;
    }
    return pool;
  }

  /**
   * Acquires a client from a pool with timeout.
   */
  private async acquireWithTimeout(pool: Pool, timeoutMs: number): Promise<PoolClient> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AcquireTimeoutError(timeoutMs));
      }, timeoutMs);

      pool
        .connect()
        .then(client => {
          clearTimeout(timer);
          resolve(client);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Validates a connection by executing a simple query.
   */
  private async validateConnection(client: PoolClient): Promise<void> {
    try {
      await client.query('SELECT 1');
    } catch (error) {
      throw new PgError({
        code: PgErrorCode.ConnectionFailed,
        message: 'Connection validation failed',
        retryable: true,
        cause: error as Error,
      });
    }
  }

  /**
   * Checks the health of a specific pool.
   */
  private async checkPoolHealth(pool: Pool): Promise<boolean> {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      this.observability.logger.warn('Pool health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Starts periodic health check interval.
   */
  private startHealthCheckInterval(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const result = await this.healthCheck();
        this.observability.metrics.gauge('pg_pool_healthy', result.healthy ? 1 : 0);
      } catch (error) {
        this.observability.logger.error('Health check interval error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.pool.healthCheckInterval);
  }

  /**
   * Generates a unique connection ID.
   */
  private generateConnectionId(): string {
    return `conn_${this.nextConnectionId++}`;
  }
}

/**
 * Creates a connection pool with default observability.
 *
 * @param config - PostgreSQL configuration
 * @param observability - Optional observability components
 * @returns Connection pool instance
 */
export function createConnectionPool(
  config: PgConfig,
  observability?: Observability
): ConnectionPool {
  const obs =
    observability ||
    (() => {
      // Import here to avoid circular dependency
      const { createNoopObservability } = require('../observability/index.js');
      return createNoopObservability();
    })();

  return new ConnectionPool(config, obs);
}
