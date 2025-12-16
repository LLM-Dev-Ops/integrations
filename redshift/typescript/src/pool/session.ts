/**
 * Redshift Session Wrapper
 *
 * Wraps a PostgreSQL connection with state management and lifecycle tracking.
 * @module @llmdevops/redshift-integration/pool/session
 */

import { v4 as uuidv4 } from 'uuid';
import type { Client, QueryResult as PgQueryResult } from 'pg';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';

/**
 * Session state.
 */
export type SessionState = 'idle' | 'active' | 'closing' | 'closed' | 'error';

/**
 * Session information.
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** Current state */
  state: SessionState;
  /** Current database */
  database?: string;
  /** Current schema */
  schema?: string;
  /** Current query group (for WLM routing) */
  queryGroup?: string;
  /** Statement timeout in milliseconds */
  statementTimeout?: number;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
  /** Number of queries executed */
  queryCount: number;
}

/**
 * Options for executing a query.
 */
export interface ExecuteOptions {
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Bind parameters */
  params?: unknown[];
}

/**
 * Session wraps a PostgreSQL connection with state and lifecycle management.
 */
export class Session {
  private readonly connection: Client;
  private readonly sessionId: string;
  private state: SessionState;
  private readonly createdAt: Date;
  private lastActivityAt: Date;
  private queryCount: number;
  private database?: string;
  private schema?: string;
  private queryGroup?: string;
  private statementTimeout?: number;

  constructor(connection: Client) {
    this.connection = connection;
    this.sessionId = uuidv4();
    this.state = 'idle';
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.queryCount = 0;
  }

  /**
   * Gets the session ID.
   */
  getId(): string {
    return this.sessionId;
  }

  /**
   * Gets the current state.
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Gets session information.
   */
  getInfo(): SessionInfo {
    return {
      sessionId: this.sessionId,
      state: this.state,
      database: this.database,
      schema: this.schema,
      queryGroup: this.queryGroup,
      statementTimeout: this.statementTimeout,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      queryCount: this.queryCount,
    };
  }

  /**
   * Gets the creation time.
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Gets the last activity time.
   */
  getLastActivityAt(): Date {
    return this.lastActivityAt;
  }

  /**
   * Gets the query count.
   */
  getQueryCount(): number {
    return this.queryCount;
  }

  /**
   * Gets the age of this session in milliseconds.
   */
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }

  /**
   * Gets the idle time in milliseconds.
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivityAt.getTime();
  }

  /**
   * Checks if the session is in an error state.
   */
  isError(): boolean {
    return this.state === 'error';
  }

  /**
   * Checks if the session is closed or closing.
   */
  isClosed(): boolean {
    return this.state === 'closed' || this.state === 'closing';
  }

  /**
   * Checks if the session is available for use.
   */
  isAvailable(): boolean {
    return this.state === 'idle';
  }

  /**
   * Marks the session as active.
   */
  markActive(): void {
    if (this.state === 'closed' || this.state === 'closing') {
      throw new RedshiftError(
        `Session ${this.sessionId} is closed`,
        RedshiftErrorCode.SESSION_EXPIRED,
        { retryable: false }
      );
    }
    this.state = 'active';
    this.lastActivityAt = new Date();
  }

  /**
   * Marks the session as idle.
   */
  markIdle(): void {
    if (this.state === 'active') {
      this.state = 'idle';
    }
    this.lastActivityAt = new Date();
  }

  /**
   * Marks the session as error.
   */
  markError(): void {
    this.state = 'error';
    this.lastActivityAt = new Date();
  }

  /**
   * Validates the session health.
   * @param validationQuery - Optional validation query (default: 'SELECT 1')
   * @returns Promise that resolves to true if healthy, false otherwise
   */
  async validate(validationQuery: string = 'SELECT 1'): Promise<boolean> {
    if (this.isClosed()) {
      return false;
    }

    try {
      this.markActive();
      await this.connection.query(validationQuery);
      this.markIdle();
      return true;
    } catch (error) {
      this.markError();
      return false;
    }
  }

  /**
   * Executes a query on this session.
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @param options - Execution options
   * @returns Promise resolving to query result
   */
  async execute(
    sql: string,
    params?: unknown[],
    options: ExecuteOptions = {}
  ): Promise<PgQueryResult> {
    if (this.isClosed()) {
      throw new RedshiftError(
        `Session ${this.sessionId} is closed`,
        RedshiftErrorCode.SESSION_EXPIRED,
        { retryable: false }
      );
    }

    if (this.state === 'error') {
      throw new RedshiftError(
        'Session is in error state',
        RedshiftErrorCode.CONNECTION_FAILED,
        { retryable: true }
      );
    }

    try {
      this.markActive();

      // Set statement timeout if specified
      if (options.timeoutMs !== undefined) {
        await this.connection.query(`SET statement_timeout = ${options.timeoutMs}`);
      }

      const result = await this.connection.query(sql, params);

      this.queryCount++;
      this.markIdle();

      return result;
    } catch (error) {
      this.markError();
      throw this.mapError(error);
    }
  }

  /**
   * Sets the current database context.
   */
  async setDatabase(database: string): Promise<void> {
    await this.execute(`SET search_path = "${database}"`);
    this.database = database;
  }

  /**
   * Sets the current schema context.
   */
  async setSchema(schema: string): Promise<void> {
    await this.execute(`SET search_path = "${schema}"`);
    this.schema = schema;
  }

  /**
   * Sets the query group for WLM routing.
   */
  async setQueryGroup(queryGroup: string): Promise<void> {
    await this.execute(`SET query_group TO '${queryGroup}'`);
    this.queryGroup = queryGroup;
  }

  /**
   * Sets the statement timeout.
   */
  async setStatementTimeout(timeoutMs: number): Promise<void> {
    await this.execute(`SET statement_timeout = ${timeoutMs}`);
    this.statementTimeout = timeoutMs;
  }

  /**
   * Resets session parameters to defaults.
   */
  async reset(): Promise<void> {
    try {
      await this.connection.query('RESET ALL');
      this.queryGroup = undefined;
      this.statementTimeout = undefined;
    } catch (error) {
      // Ignore reset errors
    }
  }

  /**
   * Closes the session and releases the connection.
   */
  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    this.state = 'closing';

    try {
      // Abort any open transaction
      await this.connection.query('ABORT').catch(() => {});

      // Close the connection
      await this.connection.end();
      this.state = 'closed';
    } catch (error) {
      this.state = 'error';
      throw new RedshiftError(
        'Failed to close session',
        RedshiftErrorCode.CONNECTION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: false,
        }
      );
    }
  }

  /**
   * Gets the underlying PostgreSQL connection (for advanced use cases).
   */
  getConnection(): Client {
    return this.connection;
  }

  /**
   * Maps PostgreSQL errors to Redshift errors.
   */
  private mapError(error: unknown): RedshiftError {
    if (error instanceof RedshiftError) {
      return error;
    }

    const pgError = error as { code?: string; message?: string };
    const message = pgError.message || 'Query execution failed';
    const sqlState = pgError.code;

    // Map PostgreSQL error codes to Redshift error codes
    let code: RedshiftErrorCode;
    let retryable = false;

    switch (sqlState) {
      // Connection errors (08xxx)
      case '08000':
      case '08003':
      case '08006':
        code = RedshiftErrorCode.CONNECTION_FAILED;
        retryable = true;
        break;

      // Authentication errors (28xxx)
      case '28000':
      case '28P01':
        code = RedshiftErrorCode.AUTHENTICATION_FAILED;
        retryable = false;
        break;

      // Query cancelled
      case '57014':
        code = RedshiftErrorCode.QUERY_CANCELLED;
        retryable = false;
        break;

      // Query timeout (57xxx)
      case '57000':
      case '57P01':
        code = RedshiftErrorCode.QUERY_TIMEOUT;
        retryable = true;
        break;

      // Serialization failure (40001)
      case '40001':
        code = RedshiftErrorCode.TRANSACTION_ABORTED;
        retryable = true;
        break;

      // Disk full (53100)
      case '53100':
        code = RedshiftErrorCode.DISK_FULL;
        retryable = false;
        break;

      // Out of memory (53200)
      case '53200':
        code = RedshiftErrorCode.RESOURCE_LIMIT;
        retryable = true;
        break;

      // Resource busy (53300)
      case '53300':
        code = RedshiftErrorCode.RESOURCE_LIMIT;
        retryable = true;
        break;

      // Syntax error (42xxx)
      case '42601':
        code = RedshiftErrorCode.SYNTAX_ERROR;
        retryable = false;
        break;

      // Table not found (42P01)
      case '42P01':
        code = RedshiftErrorCode.OBJECT_NOT_FOUND;
        retryable = false;
        break;

      // Column not found (42703)
      case '42703':
        code = RedshiftErrorCode.OBJECT_NOT_FOUND;
        retryable = false;
        break;

      // Permission denied (42501)
      case '42501':
        code = RedshiftErrorCode.PERMISSION_DENIED;
        retryable = false;
        break;

      // Data errors (22xxx)
      case '22003': // Numeric overflow
        code = RedshiftErrorCode.NUMERIC_OVERFLOW;
        retryable = false;
        break;
      case '22012': // Division by zero
        code = RedshiftErrorCode.DIVISION_BY_ZERO;
        retryable = false;
        break;
      case '22P02': // Invalid text representation
        code = RedshiftErrorCode.DATA_TYPE_MISMATCH;
        retryable = false;
        break;

      // Constraint violation (23xxx)
      case '23505': // Unique violation
      case '23503': // Foreign key violation
      case '23502': // Not null violation
        code = RedshiftErrorCode.CONSTRAINT_VIOLATION;
        retryable = false;
        break;

      default:
        code = RedshiftErrorCode.QUERY_FAILED;
        retryable = false;
    }

    return new RedshiftError(message, code, {
      sqlState,
      cause: error instanceof Error ? error : undefined,
      retryable,
    });
  }
}
