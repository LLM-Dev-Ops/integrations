/**
 * Connection Pooling for HTTP Transport
 *
 * Manages HTTP connection pooling for efficient resource usage and performance.
 * @module @llmdevops/weaviate-integration/transport/pool
 */

// ============================================================================
// Connection Pool Types
// ============================================================================

/**
 * Configuration for connection pool.
 */
export interface ConnectionPoolConfig {
  /** Maximum number of connections per host (default: 10) */
  maxConnectionsPerHost?: number;
  /** Idle timeout in milliseconds before closing connection (default: 60000) */
  idleTimeout?: number;
  /** Maximum total connections across all hosts (default: 100) */
  maxTotalConnections?: number;
  /** Interval for cleaning up idle connections in milliseconds (default: 30000) */
  cleanupInterval?: number;
  /** Enable connection health checks (default: true) */
  enableHealthChecks?: boolean;
  /** Health check interval in milliseconds (default: 60000) */
  healthCheckInterval?: number;
}

/**
 * Connection metadata.
 */
export interface Connection {
  /** Unique connection ID */
  id: string;
  /** Host that this connection is for */
  host: string;
  /** When the connection was created */
  createdAt: number;
  /** When the connection was last used */
  lastUsedAt: number;
  /** Whether the connection is currently in use */
  inUse: boolean;
  /** Number of times this connection has been used */
  useCount: number;
  /** Whether this connection is healthy */
  healthy: boolean;
}

/**
 * Connection pool statistics.
 */
export interface PoolStats {
  /** Total number of connections */
  totalConnections: number;
  /** Number of active connections */
  activeConnections: number;
  /** Number of idle connections */
  idleConnections: number;
  /** Connections per host */
  connectionsPerHost: Record<string, number>;
  /** Total connections created */
  totalCreated: number;
  /** Total connections destroyed */
  totalDestroyed: number;
  /** Total connection reuses */
  totalReuses: number;
}

// ============================================================================
// Connection Pool Implementation
// ============================================================================

/**
 * Connection pool for managing HTTP connections.
 *
 * Features:
 * - Per-host connection limits
 * - Automatic idle connection cleanup
 * - Connection health monitoring
 * - Connection reuse tracking
 * - Pool statistics
 */
export class ConnectionPool {
  private readonly config: Required<ConnectionPoolConfig>;
  private connections: Map<string, Connection[]> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private stats: PoolStats;

  constructor(config: ConnectionPoolConfig = {}) {
    this.config = {
      maxConnectionsPerHost: config.maxConnectionsPerHost ?? 10,
      idleTimeout: config.idleTimeout ?? 60000,
      maxTotalConnections: config.maxTotalConnections ?? 100,
      cleanupInterval: config.cleanupInterval ?? 30000,
      enableHealthChecks: config.enableHealthChecks ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 60000,
    };

    this.stats = this.initializeStats();
    this.startCleanupTimer();

    if (this.config.enableHealthChecks) {
      this.startHealthCheckTimer();
    }
  }

  /**
   * Initialize pool statistics.
   */
  private initializeStats(): PoolStats {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      connectionsPerHost: {},
      totalCreated: 0,
      totalDestroyed: 0,
      totalReuses: 0,
    };
  }

  /**
   * Acquire a connection for a host.
   *
   * @param host - Host to get connection for
   * @returns Connection object
   */
  async acquire(host: string): Promise<Connection> {
    // Try to reuse an idle connection
    const idleConnection = this.findIdleConnection(host);
    if (idleConnection) {
      idleConnection.inUse = true;
      idleConnection.lastUsedAt = Date.now();
      idleConnection.useCount++;
      this.stats.totalReuses++;
      this.updateStats();
      return idleConnection;
    }

    // Check if we can create a new connection
    if (!this.canCreateConnection(host)) {
      // Wait for a connection to become available or create one after cleanup
      await this.waitForAvailableConnection(host);
      return this.acquire(host); // Retry after waiting
    }

    // Create new connection
    return this.createConnection(host);
  }

  /**
   * Release a connection back to the pool.
   *
   * @param connection - Connection to release
   */
  release(connection: Connection): void {
    connection.inUse = false;
    connection.lastUsedAt = Date.now();
    this.updateStats();
  }

  /**
   * Remove a connection from the pool.
   *
   * @param connection - Connection to remove
   */
  destroy(connection: Connection): void {
    const hostConnections = this.connections.get(connection.host);
    if (hostConnections) {
      const index = hostConnections.findIndex((c) => c.id === connection.id);
      if (index !== -1) {
        hostConnections.splice(index, 1);
        this.stats.totalDestroyed++;
        this.updateStats();
      }
    }
  }

  /**
   * Close all connections and stop timers.
   */
  close(): void {
    // Clear all connections
    const hosts = Array.from(this.connections.keys());
    for (const host of hosts) {
      const connections = this.connections.get(host) ?? [];
      for (const connection of connections) {
        this.destroy(connection);
      }
    }
    this.connections.clear();

    // Stop timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.updateStats();
  }

  /**
   * Get pool statistics.
   *
   * @returns Pool statistics
   */
  getStats(): PoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Find an idle connection for a host.
   */
  private findIdleConnection(host: string): Connection | undefined {
    const hostConnections = this.connections.get(host);
    if (!hostConnections) {
      return undefined;
    }

    return hostConnections.find(
      (conn) => !conn.inUse && conn.healthy && !this.isConnectionIdle(conn)
    );
  }

  /**
   * Check if we can create a new connection for a host.
   */
  private canCreateConnection(host: string): boolean {
    const hostConnections = this.connections.get(host)?.length ?? 0;
    const totalConnections = this.getTotalConnections();

    return (
      hostConnections < this.config.maxConnectionsPerHost &&
      totalConnections < this.config.maxTotalConnections
    );
  }

  /**
   * Create a new connection for a host.
   */
  private createConnection(host: string): Connection {
    const connection: Connection = {
      id: this.generateConnectionId(),
      host,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      inUse: true,
      useCount: 1,
      healthy: true,
    };

    const hostConnections = this.connections.get(host) ?? [];
    hostConnections.push(connection);
    this.connections.set(host, hostConnections);

    this.stats.totalCreated++;
    this.updateStats();

    return connection;
  }

  /**
   * Wait for a connection to become available.
   */
  private async waitForAvailableConnection(host: string): Promise<void> {
    return new Promise((resolve) => {
      // Simple polling approach - in production, use event emitter
      const checkInterval = setInterval(() => {
        const idleConnection = this.findIdleConnection(host);
        if (idleConnection || this.canCreateConnection(host)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
  }

  /**
   * Check if a connection has been idle too long.
   */
  private isConnectionIdle(connection: Connection): boolean {
    const idleTime = Date.now() - connection.lastUsedAt;
    return idleTime > this.config.idleTimeout;
  }

  /**
   * Clean up idle connections.
   */
  private cleanupIdleConnections(): void {
    const hosts = Array.from(this.connections.keys());
    for (const host of hosts) {
      const connections = this.connections.get(host) ?? [];
      const connectionsToRemove: Connection[] = [];

      for (const connection of connections) {
        if (!connection.inUse && this.isConnectionIdle(connection)) {
          connectionsToRemove.push(connection);
        }
      }

      // Remove idle connections
      for (const connection of connectionsToRemove) {
        this.destroy(connection);
      }
    }
  }

  /**
   * Perform health checks on connections.
   */
  private performHealthChecks(): void {
    const hosts = Array.from(this.connections.keys());
    for (const host of hosts) {
      const connections = this.connections.get(host) ?? [];
      for (const connection of connections) {
        // Simple health check - mark as healthy if not too old
        const age = Date.now() - connection.createdAt;
        if (age > 300000) {
          // 5 minutes
          connection.healthy = false;
        }
      }
    }
  }

  /**
   * Start cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.cleanupInterval);
  }

  /**
   * Start health check timer.
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Get total number of connections across all hosts.
   */
  private getTotalConnections(): number {
    let total = 0;
    const allConnections = Array.from(this.connections.values());
    for (const connections of allConnections) {
      total += connections.length;
    }
    return total;
  }

  /**
   * Update pool statistics.
   */
  private updateStats(): void {
    let totalConnections = 0;
    let activeConnections = 0;
    let idleConnections = 0;
    const connectionsPerHost: Record<string, number> = {};

    const hosts = Array.from(this.connections.keys());
    for (const host of hosts) {
      const connections = this.connections.get(host) ?? [];
      totalConnections += connections.length;
      connectionsPerHost[host] = connections.length;

      for (const connection of connections) {
        if (connection.inUse) {
          activeConnections++;
        } else {
          idleConnections++;
        }
      }
    }

    this.stats.totalConnections = totalConnections;
    this.stats.activeConnections = activeConnections;
    this.stats.idleConnections = idleConnections;
    this.stats.connectionsPerHost = connectionsPerHost;
  }

  /**
   * Generate a unique connection ID.
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// Connection Pool Factory
// ============================================================================

/**
 * Create a new connection pool.
 *
 * @param config - Pool configuration
 * @returns ConnectionPool instance
 */
export function createConnectionPool(config?: ConnectionPoolConfig): ConnectionPool {
  return new ConnectionPool(config);
}
