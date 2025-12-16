/**
 * Redshift Connection Pool
 *
 * Manages a pool of Redshift connections with lifecycle management.
 * @module @llmdevops/redshift-integration/pool/pool
 */

import { EventEmitter } from 'events';
import { Client } from 'pg';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';
import { Session } from './session.js';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_POOL_MIN = 1;
export const DEFAULT_POOL_MAX = 10;
export const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 30000;
export const DEFAULT_POOL_IDLE_TIMEOUT_MS = 600000;
export const DEFAULT_POOL_MAX_LIFETIME_MS = 3600000;
export const DEFAULT_REDSHIFT_PORT = 5439;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Redshift endpoint configuration.
 */
export interface RedshiftEndpoint {
  /** Cluster host */
  host: string;
  /** Port (default: 5439) */
  port?: number;
  /** Database name */
  database: string;
  /** SSL mode */
  sslMode?: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  /** CA certificate for SSL verification */
  caCert?: string;
}

/**
 * Credential source configuration.
 */
export type CredentialSource =
  | { type: 'iam'; roleArn?: string }
  | { type: 'database'; username: string; password: string }
  | { type: 'secrets_manager'; secretId: string };

/**
 * Connection configuration.
 */
export interface ConnectionConfig {
  /** Redshift endpoint */
  endpoint: RedshiftEndpoint;
  /** Credentials */
  credentials: CredentialSource;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs?: number;
  /** Application name for tracking */
  application?: string;
  /** Default query group for WLM */
  queryGroup?: string;
  /** Statement timeout in milliseconds */
  statementTimeoutMs?: number;
}

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Minimum number of connections */
  minConnections?: number;
  /** Maximum number of connections */
  maxConnections?: number;
  /** Timeout for acquiring a connection in milliseconds */
  acquireTimeoutMs?: number;
  /** Idle timeout before connection is closed in milliseconds */
  idleTimeoutMs?: number;
  /** Maximum connection lifetime in milliseconds */
  maxLifetimeMs?: number;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;
  /** Validation query */
  validationQuery?: string;
}

// ============================================================================
// Pool Events
// ============================================================================

/**
 * Pool events that can be emitted.
 */
export interface PoolEvents {
  /** Session created */
  sessionCreated: (session: Session) => void;
  /** Session acquired */
  sessionAcquired: (session: Session) => void;
  /** Session released */
  sessionReleased: (session: Session) => void;
  /** Session destroyed */
  sessionDestroyed: (session: Session) => void;
  /** Session validation failed */
  sessionValidationFailed: (session: Session, error: Error) => void;
  /** Pool exhausted (no available sessions) */
  poolExhausted: () => void;
  /** Error occurred */
  error: (error: Error) => void;
}

/**
 * Request for a session from the pool.
 */
interface AcquireRequest {
  resolve: (session: Session) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
  requestedAt: number;
}

// ============================================================================
// Connection Pool
// ============================================================================

/**
 * ConnectionPool manages a pool of Redshift sessions.
 */
export class ConnectionPool extends EventEmitter {
  private readonly connectionConfig: ConnectionConfig;
  private readonly poolConfig: Required<PoolConfig>;
  private readonly idleSessions: Set<Session>;
  private readonly activeSessions: Set<Session>;
  private readonly acquireQueue: AcquireRequest[];
  private isShuttingDown: boolean;
  private healthCheckInterval?: NodeJS.Timeout;
  private evictionInterval?: NodeJS.Timeout;

  constructor(connectionConfig: ConnectionConfig, poolConfig?: PoolConfig) {
    super();
    this.connectionConfig = connectionConfig;
    this.poolConfig = {
      minConnections: poolConfig?.minConnections ?? DEFAULT_POOL_MIN,
      maxConnections: poolConfig?.maxConnections ?? DEFAULT_POOL_MAX,
      acquireTimeoutMs: poolConfig?.acquireTimeoutMs ?? DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
      idleTimeoutMs: poolConfig?.idleTimeoutMs ?? DEFAULT_POOL_IDLE_TIMEOUT_MS,
      maxLifetimeMs: poolConfig?.maxLifetimeMs ?? DEFAULT_POOL_MAX_LIFETIME_MS,
      healthCheckIntervalMs: poolConfig?.healthCheckIntervalMs ?? 0,
      validationQuery: poolConfig?.validationQuery ?? 'SELECT 1',
    };

    this.idleSessions = new Set();
    this.activeSessions = new Set();
    this.acquireQueue = [];
    this.isShuttingDown = false;
  }

  /**
   * Initializes the pool by creating minimum connections.
   */
  async initialize(): Promise<void> {
    const createPromises: Promise<Session>[] = [];

    for (let i = 0; i < this.poolConfig.minConnections; i++) {
      createPromises.push(this.createSession());
    }

    try {
      const sessions = await Promise.all(createPromises);
      sessions.forEach(session => this.idleSessions.add(session));
    } catch (error) {
      throw new RedshiftError(
        'Failed to initialize connection pool',
        RedshiftErrorCode.CONNECTION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    }

    // Start background tasks
    this.startEvictionTimer();
    if (this.poolConfig.healthCheckIntervalMs) {
      this.startHealthCheckTimer();
    }
  }

  /**
   * Acquires a session from the pool.
   * @param timeoutMs - Optional timeout override
   * @returns Promise resolving to a session
   */
  async acquire(timeoutMs?: number): Promise<Session> {
    if (this.isShuttingDown) {
      throw new RedshiftError(
        'Pool is shutting down',
        RedshiftErrorCode.CONNECTION_FAILED,
        { retryable: false }
      );
    }

    // Try to get an idle session
    const idleSession = this.getIdleSession();
    if (idleSession) {
      this.idleSessions.delete(idleSession);
      this.activeSessions.add(idleSession);
      idleSession.markActive();
      this.emit('sessionAcquired', idleSession);
      return idleSession;
    }

    // Try to create a new session if under max
    if (this.getTotalSessionCount() < this.poolConfig.maxConnections) {
      try {
        const newSession = await this.createSession();
        this.activeSessions.add(newSession);
        newSession.markActive();
        this.emit('sessionAcquired', newSession);
        return newSession;
      } catch (error) {
        // Fall through to queuing
      }
    }

    // Queue the request
    return this.queueAcquireRequest(timeoutMs ?? this.poolConfig.acquireTimeoutMs);
  }

  /**
   * Releases a session back to the pool.
   * @param session - Session to release
   */
  async release(session: Session): Promise<void> {
    if (!this.activeSessions.has(session)) {
      // Session not from this pool or already released
      return;
    }

    this.activeSessions.delete(session);

    // Check if session is still valid
    if (session.isClosed() || session.isError()) {
      await this.destroySession(session);
      await this.ensureMinimumSessions();
      return;
    }

    // Check if session exceeded max lifetime
    if (session.getAge() > this.poolConfig.maxLifetimeMs) {
      await this.destroySession(session);
      await this.ensureMinimumSessions();
      return;
    }

    // Reset session parameters
    try {
      await session.reset();
    } catch (error) {
      await this.destroySession(session);
      await this.ensureMinimumSessions();
      return;
    }

    session.markIdle();

    // Try to give session to a waiting request
    const request = this.acquireQueue.shift();
    if (request) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      this.activeSessions.add(session);
      session.markActive();
      this.emit('sessionAcquired', session);
      request.resolve(session);
      return;
    }

    // Return to idle pool
    this.idleSessions.add(session);
    this.emit('sessionReleased', session);
  }

  /**
   * Drains the pool by releasing all sessions.
   */
  async drain(): Promise<void> {
    this.isShuttingDown = true;

    // Stop background tasks
    this.stopEvictionTimer();
    this.stopHealthCheckTimer();

    // Reject all queued requests
    while (this.acquireQueue.length > 0) {
      const request = this.acquireQueue.shift()!;
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(
        new RedshiftError(
          'Pool is draining',
          RedshiftErrorCode.CONNECTION_FAILED,
          { retryable: false }
        )
      );
    }

    // Close all idle sessions
    const idleSessions = Array.from(this.idleSessions);
    for (const session of idleSessions) {
      await this.destroySession(session);
    }

    // Wait for active sessions to be released and closed
    // In production, you might want to force-close after a timeout
    while (this.activeSessions.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Gets the number of idle sessions.
   */
  getIdleCount(): number {
    return this.idleSessions.size;
  }

  /**
   * Gets the number of active sessions.
   */
  getActiveCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Gets the total number of sessions.
   */
  getTotalSessionCount(): number {
    return this.idleSessions.size + this.activeSessions.size;
  }

  /**
   * Gets the number of waiting acquire requests.
   */
  getWaitingCount(): number {
    return this.acquireQueue.length;
  }

  /**
   * Gets pool statistics.
   */
  getStats(): {
    idle: number;
    active: number;
    waiting: number;
    total: number;
    min: number;
    max: number;
  } {
    return {
      idle: this.getIdleCount(),
      active: this.getActiveCount(),
      waiting: this.getWaitingCount(),
      total: this.getTotalSessionCount(),
      min: this.poolConfig.minConnections,
      max: this.poolConfig.maxConnections,
    };
  }

  /**
   * Creates a new session.
   */
  private async createSession(): Promise<Session> {
    const client = await this.createConnection();
    const session = new Session(client);

    // Set default session parameters
    try {
      if (this.connectionConfig.queryGroup) {
        await session.setQueryGroup(this.connectionConfig.queryGroup);
      }
      if (this.connectionConfig.statementTimeoutMs) {
        await session.setStatementTimeout(this.connectionConfig.statementTimeoutMs);
      }
    } catch (error) {
      await client.end().catch(() => {});
      throw error;
    }

    this.emit('sessionCreated', session);
    return session;
  }

  /**
   * Creates a new PostgreSQL connection.
   */
  private async createConnection(): Promise<Client> {
    const config = this.buildConnectionConfig();
    const client = new Client(config);

    try {
      await client.connect();
      return client;
    } catch (error) {
      throw new RedshiftError(
        'Failed to create connection',
        RedshiftErrorCode.CONNECTION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    }
  }

  /**
   * Builds PostgreSQL connection configuration.
   */
  private buildConnectionConfig(): {
    host: string;
    port: number;
    database: string;
    user?: string;
    password?: string;
    connectionTimeoutMillis?: number;
    application_name?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string };
  } {
    const { endpoint, credentials, connectionTimeoutMs, application } = this.connectionConfig;

    const config: ReturnType<typeof this.buildConnectionConfig> = {
      host: endpoint.host,
      port: endpoint.port ?? DEFAULT_REDSHIFT_PORT,
      database: endpoint.database,
      connectionTimeoutMillis: connectionTimeoutMs,
      application_name: application,
    };

    // Set SSL configuration
    if (endpoint.sslMode && endpoint.sslMode !== 'disable') {
      if (endpoint.sslMode === 'require') {
        config.ssl = true;
      } else if (endpoint.sslMode === 'verify-ca' || endpoint.sslMode === 'verify-full') {
        config.ssl = {
          rejectUnauthorized: endpoint.sslMode === 'verify-full',
          ca: endpoint.caCert,
        };
      }
    }

    // Set credentials
    if (credentials.type === 'database') {
      config.user = credentials.username;
      config.password = credentials.password;
    } else if (credentials.type === 'iam') {
      // IAM authentication would require generating a temporary token
      // This is a placeholder - actual implementation would use AWS SDK
      throw new RedshiftError(
        'IAM authentication not yet implemented',
        RedshiftErrorCode.INVALID_CONFIG,
        { retryable: false }
      );
    } else if (credentials.type === 'secrets_manager') {
      // Secrets Manager authentication would require fetching credentials
      // This is a placeholder - actual implementation would use AWS SDK
      throw new RedshiftError(
        'Secrets Manager authentication not yet implemented',
        RedshiftErrorCode.INVALID_CONFIG,
        { retryable: false }
      );
    }

    return config;
  }

  /**
   * Destroys a session.
   */
  private async destroySession(session: Session): Promise<void> {
    this.idleSessions.delete(session);
    this.activeSessions.delete(session);

    try {
      await session.close();
    } catch (error) {
      // Log error but don't throw
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }

    this.emit('sessionDestroyed', session);
  }

  /**
   * Gets an idle session if available.
   */
  private getIdleSession(): Session | undefined {
    const sessions = Array.from(this.idleSessions);
    for (const session of sessions) {
      if (session.isAvailable()) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Queues an acquire request.
   */
  private queueAcquireRequest(timeoutMs: number): Promise<Session> {
    return new Promise((resolve, reject) => {
      const request: AcquireRequest = {
        resolve,
        reject,
        requestedAt: Date.now(),
      };

      // Set timeout
      request.timeoutId = setTimeout(() => {
        const index = this.acquireQueue.indexOf(request);
        if (index >= 0) {
          this.acquireQueue.splice(index, 1);
        }
        reject(
          new RedshiftError(
            `Failed to acquire connection within ${timeoutMs}ms`,
            RedshiftErrorCode.ACQUIRE_TIMEOUT,
            { retryable: true }
          )
        );
      }, timeoutMs);

      this.acquireQueue.push(request);

      // Emit pool exhausted event
      if (this.acquireQueue.length === 1) {
        this.emit('poolExhausted');
      }
    });
  }

  /**
   * Ensures minimum number of sessions are maintained.
   */
  private async ensureMinimumSessions(): Promise<void> {
    const needed = this.poolConfig.minConnections - this.getTotalSessionCount();
    if (needed <= 0) {
      return;
    }

    try {
      const session = await this.createSession();
      this.idleSessions.add(session);

      // Try to satisfy waiting request
      const request = this.acquireQueue.shift();
      if (request) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        this.idleSessions.delete(session);
        this.activeSessions.add(session);
        session.markActive();
        this.emit('sessionAcquired', session);
        request.resolve(session);
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Starts the eviction timer for idle sessions.
   */
  private startEvictionTimer(): void {
    // Run eviction every 30 seconds
    this.evictionInterval = setInterval(() => {
      this.evictIdleSessions();
    }, 30000);
  }

  /**
   * Stops the eviction timer.
   */
  private stopEvictionTimer(): void {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = undefined;
    }
  }

  /**
   * Evicts idle sessions that exceeded idle timeout.
   */
  private async evictIdleSessions(): Promise<void> {
    const sessionsToEvict: Session[] = [];
    const sessions = Array.from(this.idleSessions);

    for (const session of sessions) {
      // Keep minimum connections
      if (this.getTotalSessionCount() <= this.poolConfig.minConnections) {
        break;
      }

      // Check idle timeout
      if (session.getIdleTime() > this.poolConfig.idleTimeoutMs) {
        sessionsToEvict.push(session);
      }

      // Check max lifetime
      if (session.getAge() > this.poolConfig.maxLifetimeMs) {
        sessionsToEvict.push(session);
      }
    }

    for (const session of sessionsToEvict) {
      await this.destroySession(session);
    }

    // Ensure minimum sessions
    await this.ensureMinimumSessions();
  }

  /**
   * Starts the health check timer.
   */
  private startHealthCheckTimer(): void {
    if (!this.poolConfig.healthCheckIntervalMs) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.poolConfig.healthCheckIntervalMs);
  }

  /**
   * Stops the health check timer.
   */
  private stopHealthCheckTimer(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Performs health checks on idle sessions.
   */
  private async performHealthChecks(): Promise<void> {
    const sessionsToCheck = Array.from(this.idleSessions);

    for (const session of sessionsToCheck) {
      try {
        const isHealthy = await session.validate(this.poolConfig.validationQuery);
        if (!isHealthy) {
          this.emit('sessionValidationFailed', session, new Error('Health check failed'));
          await this.destroySession(session);
        }
      } catch (error) {
        this.emit(
          'sessionValidationFailed',
          session,
          error instanceof Error ? error : new Error(String(error))
        );
        await this.destroySession(session);
      }
    }

    // Ensure minimum sessions after health checks
    await this.ensureMinimumSessions();
  }
}
