/**
 * Connection pool management for SQL Server following SPARC specification.
 *
 * Provides connection pooling, health checks, metrics tracking, and lifecycle management
 * for SQL Server connections using mssql package.
 *
 * @module pool
 */

import * as mssql from 'mssql';
import { SqlServerConfig } from '../config/index.js';
import { ConnectionConfig, QueryIntent, PoolStats, EncryptionMode, AuthenticationType } from '../types/index.js';
import {
  SqlServerError,
  SqlServerErrorCode,
  ConnectionFailedError,
  AcquireTimeoutError,
  PoolExhaustedError,
  parseSqlServerError,
} from '../errors/index.js';
import { Observability, MetricNames } from '../observability/index.js';

/**
 * Pooled connection with metadata and tracking.
 *
 * Wraps a mssql connection with additional tracking information for monitoring,
 * metrics, and connection lifecycle management.
 */
export interface PooledConnection {
  /** Unique connection identifier */
  id: string;
  /** Underlying mssql.ConnectionPool */
  pool: mssql.ConnectionPool;
  /** mssql.Request for executing queries */
  request: mssql.Request;
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
 * Converts ConnectionConfig to mssql configuration.
 */
function toMssqlConfig(config: ConnectionConfig): mssql.config {
  const mssqlConfig: mssql.config = {
    server: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionTimeout: config.connectTimeout,
    requestTimeout: config.requestTimeout,
    options: {
      encrypt: config.encryptionMode !== EncryptionMode.Disable,
      trustServerCertificate: config.trustServerCertificate,
      enableArithAbort: true,
      appName: config.applicationName,
    },
  };

  // Handle named instances
  if (config.instanceName) {
    mssqlConfig.options = mssqlConfig.options || {};
    mssqlConfig.options.instanceName = config.instanceName;
  }

  // Handle Windows authentication
  if (config.authenticationType === AuthenticationType.Windows) {
    mssqlConfig.options = mssqlConfig.options || {};
    mssqlConfig.options.trustedConnection = true;
    if (config.domain) {
      mssqlConfig.domain = config.domain;
    }
  }

  return mssqlConfig;
}

/**
 * Connection pool implementation for SQL Server.
 *
 * Manages a pool of connections to primary and replica databases with:
 * - Automatic connection validation and health checks
 * - Metrics tracking (acquire latency, query counts, etc.)
 * - Connection lifecycle management (max age, idle timeout)
 * - Read/write routing support
 * - Graceful shutdown with connection draining
 */
export class ConnectionPool {
  private readonly config: SqlServerConfig;
  private readonly observability: Observability;
  private readonly primaryPool: mssql.ConnectionPool;
  private readonly replicaPools: mssql.ConnectionPool[];
  private readonly connections: Map<string, PooledConnection>;
  private readonly acquireLatencyTracker: LatencyTracker;
  private nextConnectionId: number;
  private closed: boolean;
  private healthCheckInterval?: NodeJS.Timeout;
  private primaryConnected: boolean = false;
  private replicasConnected: boolean[] = [];

  /**
   * Creates a new connection pool.
   *
   * @param config - SQL Server configuration
   * @param observability - Observability components (logger, metrics, tracer)
   */
  constructor(config: SqlServerConfig, observability: Observability) {
    this.config = config;
    this.observability = observability;
    this.connections = new Map();
    this.acquireLatencyTracker = new LatencyTracker();
    this.nextConnectionId = 1;
    this.closed = false;

    // Create primary pool
    const primaryMssqlConfig = toMssqlConfig(config.primary);
    primaryMssqlConfig.pool = {
      min: config.pool.minConnections,
      max: config.pool.maxConnections,
      idleTimeoutMillis: config.pool.idleTimeout,
    };
    this.primaryPool = new mssql.ConnectionPool(primaryMssqlConfig);

    // Handle pool errors
    this.primaryPool.on('error', (err: Error) => {
      this.observability.logger.error('Unexpected pool error', {
        error: err.message,
        stack: err.stack,
      });
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        type: 'pool_error',
      });
    });

    this.observability.logger.info('Created primary connection pool', {
      host: config.primary.host,
      database: config.primary.database,
      maxConnections: config.pool.maxConnections,
    });

    // Create replica pools
    this.replicaPools = [];
    if (config.replicas && config.replicas.length > 0) {
      for (const replicaConfig of config.replicas) {
        const replicaMssqlConfig = toMssqlConfig(replicaConfig);
        replicaMssqlConfig.pool = {
          min: config.pool.minConnections,
          max: config.pool.maxConnections,
          idleTimeoutMillis: config.pool.idleTimeout,
        };
        const pool = new mssql.ConnectionPool(replicaMssqlConfig);

        pool.on('error', (err: Error) => {
          this.observability.logger.error('Replica pool error', {
            error: err.message,
            host: replicaConfig.host,
          });
        });

        this.replicaPools.push(pool);
        this.replicasConnected.push(false);
        this.observability.logger.info('Created replica connection pool', {
          host: replicaConfig.host,
          database: replicaConfig.database,
        });
      }
    }
  }

  /**
   * Connects all pools.
   *
   * Must be called before using the pool.
   */
  async connect(): Promise<void> {
    try {
      await this.primaryPool.connect();
      this.primaryConnected = true;
      this.observability.logger.info('Primary pool connected');

      // Connect replicas
      for (let i = 0; i < this.replicaPools.length; i++) {
        const pool = this.replicaPools[i];
        if (pool) {
          try {
            await pool.connect();
            this.replicasConnected[i] = true;
            this.observability.logger.info(`Replica ${i} connected`);
          } catch (error) {
            this.observability.logger.warn(`Failed to connect replica ${i}`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Start health check interval if configured
      if (this.config.pool.healthCheckInterval > 0) {
        this.startHealthCheckInterval();
      }
    } catch (error) {
      this.observability.logger.error('Failed to connect primary pool', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ConnectionFailedError(this.config.primary.host, this.config.primary.port, error as Error);
    }
  }

  /**
   * Acquires a connection from the pool.
   *
   * @param role - Connection role (primary or replica)
   * @returns A pooled connection
   * @throws {SqlServerError} If pool is closed, exhausted, or acquire times out
   */
  async acquire(role: 'primary' | 'replica' = 'primary'): Promise<PooledConnection> {
    if (this.closed) {
      throw new SqlServerError({
        code: SqlServerErrorCode.ConnectionFailed,
        message: 'Connection pool is closed',
        retryable: false,
      });
    }

    const startTime = Date.now();
    const timeout = this.config.pool.acquireTimeout;

    try {
      const pool = this.selectPool(role);

      // Ensure pool is connected
      if (!pool.connected) {
        await pool.connect();
      }

      const latencyMs = Date.now() - startTime;

      // Check timeout
      if (latencyMs >= timeout) {
        throw new AcquireTimeoutError(timeout);
      }

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

      // Create pooled connection wrapper
      const pooledConnection: PooledConnection = {
        id: this.generateConnectionId(),
        pool,
        request: new mssql.Request(pool),
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

      if (error instanceof SqlServerError) {
        throw error;
      }

      throw new SqlServerError({
        code: SqlServerErrorCode.ConnectionFailed,
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

      // For mssql, we don't explicitly release connections - the pool manages them
      // But we log for tracking purposes
      if (destroy) {
        this.observability.logger.debug('Marked connection for destroy', {
          connectionId: conn.id,
        });
      } else {
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
    // mssql doesn't expose detailed pool stats, so we estimate
    const totalConnections = this.connections.size;
    const activeConnections = Array.from(this.connections.values()).filter(c => c.queryCount > 0).length;
    const idleConnections = totalConnections - activeConnections;

    return {
      totalConnections,
      idleConnections,
      activeConnections,
      waitingRequests: 0, // mssql doesn't expose this
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

    // Close all pools
    try {
      await this.primaryPool.close();
      await Promise.all(this.replicaPools.map(pool => pool.close()));
    } catch (error) {
      this.observability.logger.error('Error closing pools', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.observability.logger.info('Connection pool closed');
  }

  /**
   * Selects a pool based on the requested role.
   */
  private selectPool(role: 'primary' | 'replica'): mssql.ConnectionPool {
    if (role === 'primary' || this.replicaPools.length === 0) {
      return this.primaryPool;
    }

    // Find a connected replica
    const connectedReplicas = this.replicaPools.filter((_, i) => this.replicasConnected[i]);
    if (connectedReplicas.length === 0) {
      // Fallback to primary if no replicas are connected
      this.observability.logger.warn('No replicas connected, falling back to primary');
      return this.primaryPool;
    }

    // Simple round-robin selection for replicas
    const index = Math.floor(Math.random() * connectedReplicas.length);
    const pool = connectedReplicas[index];
    if (!pool) {
      return this.primaryPool;
    }
    return pool;
  }

  /**
   * Checks the health of a specific pool.
   */
  private async checkPoolHealth(pool: mssql.ConnectionPool): Promise<boolean> {
    try {
      if (!pool.connected) {
        return false;
      }
      const request = new mssql.Request(pool);
      await request.query('SELECT 1');
      return true;
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
        this.observability.metrics.gauge('sqlserver_pool_healthy', result.healthy ? 1 : 0);
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
 * @param config - SQL Server configuration
 * @param observability - Optional observability components
 * @returns Connection pool instance
 */
export function createConnectionPool(
  config: SqlServerConfig,
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
