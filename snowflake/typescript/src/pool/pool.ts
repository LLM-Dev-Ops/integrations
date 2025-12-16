/**
 * Snowflake Connection Pool
 *
 * Manages a pool of Snowflake connections with lifecycle management.
 * @module @llmdevops/snowflake-integration/pool/pool
 */

import { EventEmitter } from 'events';
import type { ConnectionConfig, PoolConfig } from '../config/index.js';
import {
  DEFAULT_POOL_MIN,
  DEFAULT_POOL_MAX,
  DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
  DEFAULT_POOL_IDLE_TIMEOUT_MS,
  DEFAULT_POOL_MAX_LIFETIME_MS,
} from '../config/index.js';
import {
  PoolExhaustedError,
  AcquireTimeoutError,
  ConnectionError,
  fromSdkError,
} from '../errors/index.js';
import { Session } from './session.js';

// Snowflake SDK types (defined here to avoid direct dependency on snowflake-sdk types)
interface ConnectionOptions {
  account: string;
  username?: string;
  password?: string;
  database?: string;
  schema?: string;
  warehouse?: string;
  role?: string;
  application?: string;
  timeout?: number;
  authenticator?: string;
  token?: string;
  privateKey?: string;
  privateKeyPath?: string;
  privateKeyPass?: string;
  region?: string;
  host?: string;
  port?: number;
  clientSessionKeepAlive?: boolean;
  clientSessionKeepAliveHeartbeatFrequency?: number;
}

interface SnowflakeStatic {
  createConnection(options: ConnectionOptions): any;
}

// Import snowflake-sdk dynamically
declare const require: any;
let snowflake: SnowflakeStatic;
try {
  snowflake = require('snowflake-sdk');
} catch {
  // Fallback for when snowflake-sdk is not installed (e.g., during type checking)
  snowflake = {
    createConnection: () => {
      throw new Error('snowflake-sdk is not installed');
    },
  };
}

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

/**
 * ConnectionPool manages a pool of Snowflake sessions.
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
      throw new ConnectionError(
        'Failed to initialize connection pool',
        error instanceof Error ? error : undefined
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
      throw new ConnectionError('Pool is shutting down');
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
      request.reject(new ConnectionError('Pool is draining'));
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
    const connectionOptions = this.buildConnectionOptions();

    return new Promise((resolve, reject) => {
      const connection = snowflake.createConnection(connectionOptions);

      connection.connect((err?: any) => {
        if (err) {
          reject(fromSdkError(err));
          return;
        }

        const session = new Session(connection);
        this.emit('sessionCreated', session);
        resolve(session);
      });
    });
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
        reject(new AcquireTimeoutError(timeoutMs));
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
    const now = Date.now();
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
        this.emit('sessionValidationFailed', session, error instanceof Error ? error : new Error(String(error)));
        await this.destroySession(session);
      }
    }

    // Ensure minimum sessions after health checks
    await this.ensureMinimumSessions();
  }

  /**
   * Builds Snowflake connection options from config.
   */
  private buildConnectionOptions(): ConnectionOptions {
    const config = this.connectionConfig;
    const options: ConnectionOptions = {
      account: config.account,
      database: config.database,
      schema: config.schema,
      warehouse: config.warehouse,
      role: config.role,
      application: config.application,
      timeout: config.connectTimeoutMs,
      clientSessionKeepAlive: config.clientSessionKeepAlive,
      clientSessionKeepAliveHeartbeatFrequency: config.clientSessionKeepAliveHeartbeatFrequency,
    };

    // Set authentication based on method
    const auth = config.auth;
    if (auth.method === 'password') {
      options.username = auth.username;
      options.password = auth.password;
    } else if (auth.method === 'keypair') {
      options.username = auth.username;
      options.authenticator = 'SNOWFLAKE_JWT';
      if (auth.privateKey) {
        options.privateKey = auth.privateKey;
      } else if (auth.privateKeyPath) {
        options.privateKeyPath = auth.privateKeyPath;
      }
      if (auth.privateKeyPassphrase) {
        options.privateKeyPass = auth.privateKeyPassphrase;
      }
    } else if (auth.method === 'oauth') {
      options.authenticator = 'OAUTH';
      options.token = auth.token;
    } else if (auth.method === 'external_browser') {
      options.username = auth.username;
      options.authenticator = 'EXTERNALBROWSER';
    }

    // Optional connection settings
    if (config.region) {
      options.region = config.region;
    }
    if (config.host) {
      options.host = config.host;
    }
    if (config.port) {
      options.port = config.port;
    }

    return options;
  }
}
