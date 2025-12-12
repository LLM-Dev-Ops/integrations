/**
 * Connection pooling for efficient HTTP connection management.
 *
 * This module provides connection pooling functionality using undici's Pool class
 * to optimize HTTP communication by reusing connections and implementing health checking.
 *
 * @module http/pool
 */

import { Pool } from 'undici';
import type { HttpResponse, PoolOptions, PoolStats } from './types.js';

/**
 * Default pool configuration values.
 */
const DEFAULT_POOL_OPTIONS: Required<PoolOptions> = {
  maxIdlePerHost: 10,
  idleTimeout: 90000, // 90 seconds
  maxLifetime: 300000, // 5 minutes
};

/**
 * Connection pool for managing HTTP connections.
 *
 * This pool manages connection limits and ensures that connections are
 * properly reused and cleaned up. It uses undici's Pool for efficient
 * connection management with HTTP/1.1 and HTTP/2 support.
 *
 * @example
 * ```typescript
 * const pool = new ConnectionPool('https://email.us-east-1.amazonaws.com', {
 *   maxIdlePerHost: 10,
 *   idleTimeout: 90000,
 *   maxLifetime: 300000
 * });
 *
 * try {
 *   const response = await pool.request({
 *     method: 'GET',
 *     path: '/v2/email/identities',
 *     headers: { 'Accept': 'application/json' }
 *   });
 *   console.log('Status:', response.status);
 * } finally {
 *   await pool.close();
 * }
 * ```
 */
export class ConnectionPool {
  private readonly pool: Pool;
  private readonly options: Required<PoolOptions>;
  private activeConnections = 0;
  private totalConnections = 0;
  private connectionReuses = 0;
  private closed = false;

  /**
   * Create a new connection pool.
   *
   * @param origin - The origin URL (protocol + host) for the pool
   * @param options - Optional pool configuration
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://email.us-east-1.amazonaws.com', {
   *   maxIdlePerHost: 20,
   *   idleTimeout: 120000
   * });
   * ```
   */
  constructor(origin: string, options?: PoolOptions) {
    this.options = {
      ...DEFAULT_POOL_OPTIONS,
      ...options,
    };

    // Create undici pool with configured options
    this.pool = new Pool(origin, {
      connections: this.options.maxIdlePerHost,
      pipelining: 1,
      keepAliveTimeout: this.options.idleTimeout,
      keepAliveMaxTimeout: this.options.maxLifetime ?? this.options.idleTimeout,
      keepAliveTimeoutThreshold: 1000,
    });
  }

  /**
   * Execute an HTTP request using the connection pool.
   *
   * This method automatically manages connection acquisition and release.
   *
   * @param options - Request options
   * @returns Promise resolving to the HTTP response
   * @throws Error if the pool is closed or the request fails
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   *
   * const response = await pool.request({
   *   method: 'POST',
   *   path: '/v2/email/outbound-emails',
   *   headers: {
   *     'Content-Type': 'application/json',
   *     'Authorization': 'AWS4-HMAC-SHA256 ...'
   *   },
   *   body: JSON.stringify({ /* email data *\/ })
   * });
   * ```
   */
  async request(options: RequestOptions): Promise<HttpResponse> {
    if (this.closed) {
      throw new Error('Connection pool is closed');
    }

    // Track connection acquisition
    this.activeConnections++;
    const isNewConnection = this.activeConnections > this.totalConnections;
    if (isNewConnection) {
      this.totalConnections++;
    } else {
      this.connectionReuses++;
    }

    try {
      // Execute request using undici pool
      const response = await this.pool.request({
        method: options.method as any,
        path: options.path,
        headers: options.headers,
        body: options.body,
      });

      // Read response body
      const bodyData = await response.body.text();

      // Convert headers to Record<string, string>
      const headers: Record<string, string> = {};
      if (typeof response.headers === 'object' && response.headers !== null) {
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') {
            headers[key.toLowerCase()] = value;
          } else if (Array.isArray(value)) {
            headers[key.toLowerCase()] = value.join(', ');
          }
        }
      }

      return {
        status: response.statusCode,
        headers,
        body: bodyData,
      };
    } finally {
      // Track connection release
      this.activeConnections--;
    }
  }

  /**
   * Get the current number of active connections.
   *
   * @returns The number of currently active connections
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * console.log('Active connections:', pool.activeConnectionsCount());
   * ```
   */
  activeConnectionsCount(): number {
    return this.activeConnections;
  }

  /**
   * Get the total number of connections created.
   *
   * @returns The total number of connections created since pool initialization
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * console.log('Total connections:', pool.totalConnectionsCount());
   * ```
   */
  totalConnectionsCount(): number {
    return this.totalConnections;
  }

  /**
   * Get the number of connection reuses.
   *
   * @returns The number of times connections have been reused
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * console.log('Connection reuses:', pool.connectionReusesCount());
   * ```
   */
  connectionReusesCount(): number {
    return this.connectionReuses;
  }

  /**
   * Check if the connection pool is healthy.
   *
   * A pool is considered healthy if:
   * - It is not closed
   * - Active connections are within the configured limit
   *
   * @returns true if the pool is healthy, false otherwise
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * if (!pool.isHealthy()) {
   *   console.warn('Pool is unhealthy!');
   * }
   * ```
   */
  isHealthy(): boolean {
    return (
      !this.closed &&
      this.activeConnections < this.options.maxIdlePerHost
    );
  }

  /**
   * Get pool statistics.
   *
   * @returns Pool statistics including connection counts and reuse metrics
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * const stats = pool.stats();
   * console.log('Reuse rate:', stats.reuseRate());
   * console.log('Utilization:', stats.utilizationRate());
   * ```
   */
  stats(): PoolStatistics {
    return new PoolStatistics({
      activeConnections: this.activeConnections,
      totalConnections: this.totalConnections,
      connectionReuses: this.connectionReuses,
      availablePermits: Math.max(0, this.options.maxIdlePerHost - this.activeConnections),
      maxIdlePerHost: this.options.maxIdlePerHost,
    });
  }

  /**
   * Close the connection pool.
   *
   * This closes all connections and prevents new requests.
   * Should be called when the pool is no longer needed to free resources.
   *
   * @returns Promise that resolves when all connections are closed
   *
   * @example
   * ```typescript
   * const pool = new ConnectionPool('https://api.example.com');
   * // ... use pool ...
   * await pool.close();
   * ```
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.pool.close();
  }

  /**
   * Get the idle timeout duration.
   *
   * @returns The idle timeout in milliseconds
   */
  getIdleTimeout(): number {
    return this.options.idleTimeout;
  }

  /**
   * Get the maximum connection lifetime.
   *
   * @returns The maximum lifetime in milliseconds
   */
  getMaxLifetime(): number {
    return this.options.maxLifetime;
  }
}

/**
 * Request options for connection pool requests.
 */
export interface RequestOptions {
  /**
   * HTTP method.
   */
  method: string;

  /**
   * Request path (e.g., '/v2/email/identities').
   */
  path: string;

  /**
   * Request headers.
   */
  headers?: Record<string, string>;

  /**
   * Request body.
   */
  body?: string;
}

/**
 * Statistics for a connection pool.
 *
 * Provides metrics for monitoring and debugging connection pool behavior.
 */
export class PoolStatistics implements PoolStats {
  activeConnections: number;
  totalConnections: number;
  connectionReuses: number;
  availablePermits: number;
  maxIdlePerHost: number;

  constructor(stats: PoolStats) {
    this.activeConnections = stats.activeConnections;
    this.totalConnections = stats.totalConnections;
    this.connectionReuses = stats.connectionReuses;
    this.availablePermits = stats.availablePermits;
    this.maxIdlePerHost = stats.maxIdlePerHost;
  }

  /**
   * Calculate the connection reuse rate.
   *
   * @returns The percentage of requests that reused an existing connection (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const stats = pool.stats();
   * console.log(`Reuse rate: ${(stats.reuseRate() * 100).toFixed(1)}%`);
   * ```
   */
  reuseRate(): number {
    const totalRequests = this.totalConnections + this.connectionReuses;
    return totalRequests === 0 ? 0 : this.connectionReuses / totalRequests;
  }

  /**
   * Calculate the pool utilization rate.
   *
   * @returns The percentage of pool capacity currently in use (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const stats = pool.stats();
   * console.log(`Utilization: ${(stats.utilizationRate() * 100).toFixed(1)}%`);
   * ```
   */
  utilizationRate(): number {
    return this.maxIdlePerHost === 0
      ? 0
      : this.activeConnections / this.maxIdlePerHost;
  }
}
