/**
 * Async Query Handle
 *
 * Handle for managing asynchronous query execution in Redshift.
 * Unlike Snowflake, Redshift doesn't have a native async query API, so this
 * implementation tracks queries via system tables (STV_RECENTS, STV_INFLIGHT)
 * and manages state internally.
 *
 * @module @llmdevops/redshift-integration/query/async-handle
 */

import { v4 as uuidv4 } from 'uuid';
import type { QueryResult as PgQueryResult } from 'pg';
import {
  QueryResult,
  QueryStatus,
  AsyncQueryStatus,
  ResultSet,
  ColumnMetadata,
  Row,
  createRow,
} from '../types/index.js';
import {
  RedshiftError,
  RedshiftErrorCode,
  wrapError,
} from '../errors/index.js';
import type { ConnectionPool } from '../pool/pool.js';
import type { Session } from '../pool/session.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for async query management.
 */
export interface AsyncQueryConfig {
  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Maximum number of poll attempts before giving up (default: unlimited) */
  maxPollAttempts?: number;
  /** Result cache TTL in milliseconds (default: 300000 = 5 minutes) */
  resultCacheTtlMs?: number;
  /** Exponential backoff multiplier (default: 1.5) */
  backoffMultiplier?: number;
  /** Maximum polling interval in milliseconds (default: 30000) */
  maxPollIntervalMs?: number;
}

/**
 * Options for waiting on async queries.
 */
export interface WaitOptions {
  /** Polling interval in milliseconds (default: from config) */
  pollIntervalMs?: number;
  /** Exponential backoff multiplier (default: from config) */
  backoffMultiplier?: number;
  /** Maximum polling interval in milliseconds (default: from config) */
  maxPollIntervalMs?: number;
  /** Timeout in milliseconds (optional) */
  timeoutMs?: number;
}

/**
 * Default async query configuration.
 */
const DEFAULT_CONFIG: Required<AsyncQueryConfig> = {
  pollIntervalMs: 1000,
  maxPollAttempts: 0, // unlimited
  resultCacheTtlMs: 300000,
  backoffMultiplier: 1.5,
  maxPollIntervalMs: 30000,
};

// ============================================================================
// Internal State Tracking
// ============================================================================

/**
 * Internal query state for tracking.
 */
interface QueryState {
  /** Query ID (process ID) */
  queryId: string;
  /** SQL text */
  sqlText: string;
  /** Submission timestamp */
  submittedAt: Date;
  /** Cached result (if completed) */
  cachedResult?: QueryResult;
  /** Cached error (if failed) */
  cachedError?: Error;
  /** Cache timestamp */
  cachedAt?: Date;
  /** Whether query was cancelled */
  cancelled: boolean;
}

// ============================================================================
// Async Query Handle
// ============================================================================

/**
 * Handle for an asynchronous query execution.
 * Provides methods to poll status, wait for completion, and retrieve results.
 */
export class AsyncQueryHandle {
  private readonly queryState: QueryState;
  private readonly manager: AsyncQueryManager;
  private currentStatus?: AsyncQueryStatus;

  /**
   * Creates a new async query handle.
   * This should typically be created via AsyncQueryManager.submitAsync().
   *
   * @param queryId - The query ID (process ID)
   * @param sqlText - The SQL text that was submitted
   * @param submittedAt - The submission timestamp
   * @param manager - The manager that created this handle
   */
  constructor(
    queryId: string,
    sqlText: string,
    submittedAt: Date,
    manager: AsyncQueryManager
  ) {
    this.queryState = {
      queryId,
      sqlText,
      submittedAt,
      cancelled: false,
    };
    this.manager = manager;
  }

  /**
   * Gets the query ID.
   */
  get queryId(): string {
    return this.queryState.queryId;
  }

  /**
   * Gets the SQL text.
   */
  get sqlText(): string {
    return this.queryState.sqlText;
  }

  /**
   * Gets the submission timestamp.
   */
  get submittedAt(): Date {
    return this.queryState.submittedAt;
  }

  /**
   * Gets the current cached status (without polling).
   */
  get status(): AsyncQueryStatus | undefined {
    return this.currentStatus;
  }

  /**
   * Polls the current status of the query.
   *
   * @returns The current query status
   * @throws RedshiftError if status check fails
   */
  async poll(): Promise<AsyncQueryStatus> {
    if (this.queryState.cancelled) {
      this.currentStatus = {
        queryId: this.queryState.queryId,
        status: { status: 'cancelled' },
        sqlText: this.queryState.sqlText,
        startTime: this.queryState.submittedAt,
      };
      return this.currentStatus;
    }

    // Check cache first
    if (this.queryState.cachedResult) {
      const cacheAge = Date.now() - (this.queryState.cachedAt?.getTime() ?? 0);
      if (cacheAge < this.manager.getConfig().resultCacheTtlMs) {
        this.currentStatus = {
          queryId: this.queryState.queryId,
          status: { status: 'success', result: this.queryState.cachedResult },
          sqlText: this.queryState.sqlText,
          startTime: this.queryState.submittedAt,
          endTime: this.queryState.cachedAt,
        };
        return this.currentStatus;
      }
    }

    if (this.queryState.cachedError) {
      const cacheAge = Date.now() - (this.queryState.cachedAt?.getTime() ?? 0);
      if (cacheAge < this.manager.getConfig().resultCacheTtlMs) {
        this.currentStatus = {
          queryId: this.queryState.queryId,
          status: { status: 'failed', error: this.queryState.cachedError },
          sqlText: this.queryState.sqlText,
          startTime: this.queryState.submittedAt,
          endTime: this.queryState.cachedAt,
        };
        return this.currentStatus;
      }
    }

    try {
      this.currentStatus = await this.manager.getQueryStatus(this.queryState.queryId);

      // Cache completed results
      if (this.currentStatus.status.status === 'success') {
        this.queryState.cachedResult = this.currentStatus.status.result;
        this.queryState.cachedAt = new Date();
      } else if (this.currentStatus.status.status === 'failed') {
        this.queryState.cachedError = this.currentStatus.status.error;
        this.queryState.cachedAt = new Date();
      }

      return this.currentStatus;
    } catch (error) {
      throw wrapError(error, 'Failed to poll query status');
    }
  }

  /**
   * Waits for the query to complete and returns the result.
   *
   * @param options - Wait options
   * @returns The query result
   * @throws RedshiftError if the query fails or is cancelled
   */
  async wait(options?: WaitOptions): Promise<QueryResult> {
    const config = this.manager.getConfig();
    const opts: Required<WaitOptions> = {
      pollIntervalMs: options?.pollIntervalMs ?? config.pollIntervalMs,
      backoffMultiplier: options?.backoffMultiplier ?? config.backoffMultiplier,
      maxPollIntervalMs: options?.maxPollIntervalMs ?? config.maxPollIntervalMs,
      timeoutMs: options?.timeoutMs ?? 0,
    };

    const startTime = Date.now();
    let pollInterval = opts.pollIntervalMs;
    let pollAttempts = 0;

    while (true) {
      // Check timeout
      if (opts.timeoutMs > 0 && Date.now() - startTime >= opts.timeoutMs) {
        throw new RedshiftError(
          `Query timeout after ${opts.timeoutMs}ms`,
          RedshiftErrorCode.QUERY_TIMEOUT,
          {
            queryId: this.queryState.queryId,
            retryable: false,
          }
        );
      }

      // Check max poll attempts
      if (config.maxPollAttempts > 0 && pollAttempts >= config.maxPollAttempts) {
        throw new RedshiftError(
          `Exceeded maximum poll attempts (${config.maxPollAttempts})`,
          RedshiftErrorCode.QUERY_TIMEOUT,
          {
            queryId: this.queryState.queryId,
            retryable: false,
          }
        );
      }

      const status = await this.poll();
      pollAttempts++;

      switch (status.status.status) {
        case 'success':
          return status.status.result;

        case 'failed':
          throw new RedshiftError(
            `Query failed: ${status.status.error.message}`,
            RedshiftErrorCode.QUERY_FAILED,
            {
              queryId: this.queryState.queryId,
              cause: status.status.error,
              retryable: false,
            }
          );

        case 'cancelled':
          throw new RedshiftError(
            'Query was cancelled',
            RedshiftErrorCode.QUERY_CANCELLED,
            {
              queryId: this.queryState.queryId,
              retryable: false,
            }
          );

        case 'queued':
        case 'running':
          // Continue polling
          await this.sleep(pollInterval);
          // Exponential backoff
          pollInterval = Math.min(
            pollInterval * opts.backoffMultiplier,
            opts.maxPollIntervalMs
          );
          break;
      }
    }
  }

  /**
   * Gets the result if the query is complete, otherwise returns null.
   *
   * @returns The query result or null if not complete
   */
  async getResult(): Promise<QueryResult | null> {
    const status = await this.poll();

    if (status.status.status === 'success') {
      return status.status.result;
    }

    return null;
  }

  /**
   * Cancels the query.
   *
   * @throws RedshiftError if cancellation fails
   */
  async cancel(): Promise<void> {
    if (this.queryState.cancelled) {
      return;
    }

    try {
      await this.manager.cancelQuery(this.queryState.queryId);
      this.queryState.cancelled = true;
      this.currentStatus = {
        queryId: this.queryState.queryId,
        status: { status: 'cancelled' },
        sqlText: this.queryState.sqlText,
        startTime: this.queryState.submittedAt,
        endTime: new Date(),
      };
    } catch (error) {
      throw wrapError(error, 'Failed to cancel query');
    }
  }

  /**
   * Checks if the query is complete (success, failed, or cancelled).
   *
   * @returns True if the query is complete
   */
  async isComplete(): Promise<boolean> {
    const status = await this.poll();
    const s = status.status.status;
    return s === 'success' || s === 'failed' || s === 'cancelled';
  }

  /**
   * Gets the query progress if available.
   *
   * @returns Progress information or null
   */
  async getProgress(): Promise<{ elapsedMs?: number; progress?: number } | null> {
    const status = await this.poll();
    if (status.status.status === 'running') {
      return {
        elapsedMs: status.status.elapsedMs,
        progress: status.status.progress,
      };
    }
    return null;
  }

  /**
   * Helper method to sleep for a duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Async Query Manager
// ============================================================================

/**
 * Manager for asynchronous query execution.
 * Provides methods to submit queries, track their status, and retrieve results.
 */
export class AsyncQueryManager {
  private readonly pool: ConnectionPool;
  private readonly config: Required<AsyncQueryConfig>;

  /**
   * Creates a new async query manager.
   *
   * @param pool - Connection pool to use for queries
   * @param config - Optional configuration
   */
  constructor(pool: ConnectionPool, config?: AsyncQueryConfig) {
    this.pool = pool;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): Required<AsyncQueryConfig> {
    return { ...this.config };
  }

  /**
   * Submits a query for asynchronous execution.
   * The query is executed immediately, but this method returns a handle
   * that can be used to track its progress and retrieve results.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns A handle for tracking the query
   * @throws RedshiftError if submission fails
   */
  async submitAsync(sql: string, params?: unknown[]): Promise<AsyncQueryHandle> {
    let session: Session | undefined;

    try {
      session = await this.pool.acquire();

      // Get the backend PID which serves as our query ID
      const pidResult = await session.execute('SELECT pg_backend_pid() as pid');
      const queryId = String(pidResult.rows[0]?.pid);

      if (!queryId) {
        throw new RedshiftError(
          'Failed to get backend PID',
          RedshiftErrorCode.INTERNAL_ERROR,
          { retryable: true }
        );
      }

      const submittedAt = new Date();

      // Start the query asynchronously
      // We don't await this - it runs in the background
      this.executeQueryInBackground(session, sql, params, queryId, submittedAt);

      // Create and return handle
      const handle = new AsyncQueryHandle(queryId, sql, submittedAt, this);

      return handle;
    } catch (error) {
      if (session) {
        await this.pool.release(session);
      }
      throw wrapError(error, 'Failed to submit async query');
    }
  }

  /**
   * Gets the status of a query by its ID.
   *
   * @param queryId - The query ID (process ID)
   * @returns The query status
   * @throws RedshiftError if status check fails
   */
  async getQueryStatus(queryId: string): Promise<AsyncQueryStatus> {
    let session: Session | undefined;

    try {
      session = await this.pool.acquire();

      // Check STV_INFLIGHT for currently running queries
      const inflightQuery = `
        SELECT
          pid,
          query,
          starttime,
          elapsed / 1000000.0 as elapsed_seconds,
          database,
          user_name
        FROM stv_inflight
        WHERE pid = $1
      `;

      const inflightResult = await session.execute(inflightQuery, [queryId]);

      if (inflightResult.rows.length > 0) {
        const row = inflightResult.rows[0];
        const elapsedMs = row.elapsed_seconds ? Math.round(row.elapsed_seconds * 1000) : undefined;

        return {
          queryId,
          status: {
            status: 'running',
            elapsedMs,
          },
          sqlText: String(row.query || ''),
          startTime: row.starttime ? new Date(row.starttime) : undefined,
          database: String(row.database || undefined),
          username: String(row.user_name || undefined),
        };
      }

      // Check STV_RECENTS for recently completed queries
      const recentsQuery = `
        SELECT
          pid,
          query,
          starttime,
          endtime,
          status,
          elapsed / 1000000.0 as elapsed_seconds,
          database,
          user_name
        FROM stv_recents
        WHERE pid = $1
        ORDER BY starttime DESC
        LIMIT 1
      `;

      const recentsResult = await session.execute(recentsQuery, [queryId]);

      if (recentsResult.rows.length > 0) {
        const row = recentsResult.rows[0];
        const status = String(row.status || '').toLowerCase();

        // Map Redshift status to our status type
        if (status === 'success' || status === 'completed' || status === 'done') {
          // Query completed successfully - try to get the actual result
          // Note: We can't retrieve the actual result data from system tables,
          // so we return a minimal result
          const result: QueryResult = {
            queryId,
            sqlText: String(row.query || ''),
            resultSet: {
              columns: [],
              rows: [],
              rowCount: 0,
            },
            statistics: {
              executionTimeMs: row.elapsed_seconds ? Math.round(row.elapsed_seconds * 1000) : 0,
              rowsReturned: 0,
            },
          };

          return {
            queryId,
            status: { status: 'success', result },
            sqlText: String(row.query || ''),
            startTime: row.starttime ? new Date(row.starttime) : undefined,
            endTime: row.endtime ? new Date(row.endtime) : undefined,
            database: String(row.database || undefined),
            username: String(row.user_name || undefined),
          };
        } else if (status === 'error' || status === 'failed') {
          const error = new RedshiftError(
            'Query failed',
            RedshiftErrorCode.QUERY_FAILED,
            {
              queryId,
              retryable: false,
            }
          );

          return {
            queryId,
            status: { status: 'failed', error },
            sqlText: String(row.query || ''),
            startTime: row.starttime ? new Date(row.starttime) : undefined,
            endTime: row.endtime ? new Date(row.endtime) : undefined,
            database: String(row.database || undefined),
            username: String(row.user_name || undefined),
          };
        } else if (status === 'cancelled' || status === 'aborted') {
          return {
            queryId,
            status: { status: 'cancelled' },
            sqlText: String(row.query || ''),
            startTime: row.starttime ? new Date(row.starttime) : undefined,
            endTime: row.endtime ? new Date(row.endtime) : undefined,
            database: String(row.database || undefined),
            username: String(row.user_name || undefined),
          };
        }
      }

      // Query not found - might be queued or very recently submitted
      return {
        queryId,
        status: { status: 'queued' },
      };
    } catch (error) {
      throw wrapError(error, 'Failed to get query status');
    } finally {
      if (session) {
        await this.pool.release(session);
      }
    }
  }

  /**
   * Gets the result of a completed query.
   * If the query is still running, waits for completion.
   *
   * @param queryId - The query ID
   * @returns The query result
   * @throws RedshiftError if retrieval fails
   */
  async getQueryResult(queryId: string): Promise<QueryResult> {
    const status = await this.getQueryStatus(queryId);

    if (status.status.status === 'success') {
      return status.status.result;
    }

    if (status.status.status === 'failed') {
      throw new RedshiftError(
        `Query failed: ${status.status.error.message}`,
        RedshiftErrorCode.QUERY_FAILED,
        {
          queryId,
          cause: status.status.error,
          retryable: false,
        }
      );
    }

    if (status.status.status === 'cancelled') {
      throw new RedshiftError(
        'Query was cancelled',
        RedshiftErrorCode.QUERY_CANCELLED,
        {
          queryId,
          retryable: false,
        }
      );
    }

    // Query is still running or queued
    throw new RedshiftError(
      'Query is not yet complete',
      RedshiftErrorCode.QUERY_FAILED,
      {
        queryId,
        retryable: true,
      }
    );
  }

  /**
   * Cancels a running query.
   *
   * @param queryId - The query ID (process ID)
   * @throws RedshiftError if cancellation fails
   */
  async cancelQuery(queryId: string): Promise<void> {
    let session: Session | undefined;

    try {
      session = await this.pool.acquire();

      // Use pg_cancel_backend to cancel the query
      // This sends a cancellation signal to the backend process
      const cancelQuery = `SELECT pg_cancel_backend($1)`;
      const result = await session.execute(cancelQuery, [queryId]);

      const success = result.rows[0]?.pg_cancel_backend;
      if (!success) {
        // Try pg_terminate_backend as a fallback (more forceful)
        const terminateQuery = `SELECT pg_terminate_backend($1)`;
        await session.execute(terminateQuery, [queryId]);
      }
    } catch (error) {
      throw wrapError(error, 'Failed to cancel query');
    } finally {
      if (session) {
        await this.pool.release(session);
      }
    }
  }

  /**
   * Waits for a query to complete with optional timeout.
   *
   * @param handle - The query handle
   * @param options - Wait options
   * @returns The query result
   */
  async waitForCompletion(
    handle: AsyncQueryHandle,
    options?: WaitOptions
  ): Promise<QueryResult> {
    return handle.wait(options);
  }

  /**
   * Executes a query in the background and manages the session lifecycle.
   * This is called internally by submitAsync().
   */
  private async executeQueryInBackground(
    session: Session,
    sql: string,
    params: unknown[] | undefined,
    queryId: string,
    submittedAt: Date
  ): Promise<void> {
    try {
      // Execute the query
      const startTime = Date.now();
      const result = await session.execute(sql, params);
      const executionTimeMs = Date.now() - startTime;

      // Convert PostgreSQL result to our QueryResult format
      const columns: ColumnMetadata[] = result.fields.map((field) => ({
        name: field.name,
        type: this.mapDataTypeId(field.dataTypeID),
        dataTypeID: field.dataTypeID,
        tableID: field.tableID,
        columnID: field.columnID,
        dataTypeModifier: field.dataTypeModifier,
        dataTypeSize: field.dataTypeSize,
        format: field.format,
      }));

      // Convert raw rows to typed Row objects
      const rows: Row[] = result.rows.map((row) => createRow(row, columns));

      const resultSet: ResultSet = {
        columns,
        rows,
        rowCount: result.rowCount ?? result.rows.length,
        command: result.command,
        oid: result.oid,
      };

      // Note: We can't easily cache this result in the handle from here
      // The handle will need to re-execute or track results separately

    } catch (error) {
      // Query failed - error will be visible in system tables
    } finally {
      // Release the session back to the pool
      await this.pool.release(session);
    }
  }

  /**
   * Maps PostgreSQL data type OID to Redshift data type.
   */
  private mapDataTypeId(oid: number): import('../types/index.js').RedshiftDataType {
    // Common PostgreSQL/Redshift type OIDs
    const typeMap: Record<number, import('../types/index.js').RedshiftDataType> = {
      16: 'BOOLEAN',
      20: 'BIGINT',
      21: 'SMALLINT',
      23: 'INTEGER',
      25: 'TEXT',
      700: 'REAL',
      701: 'DOUBLE PRECISION',
      1043: 'VARCHAR',
      1082: 'DATE',
      1114: 'TIMESTAMP',
      1184: 'TIMESTAMPTZ',
      1700: 'NUMERIC',
      17: 'BYTEA',
      114: 'JSON',
      3802: 'JSONB',
    };

    return typeMap[oid] || 'UNKNOWN';
  }
}

/**
 * Creates an async query handle.
 * This is a convenience function that's primarily used internally.
 *
 * @param queryId - The query ID
 * @param sqlText - The SQL text
 * @param submittedAt - The submission timestamp
 * @param manager - The manager
 * @returns A new async query handle
 */
export function createAsyncQueryHandle(
  queryId: string,
  sqlText: string,
  submittedAt: Date,
  manager: AsyncQueryManager
): AsyncQueryHandle {
  return new AsyncQueryHandle(queryId, sqlText, submittedAt, manager);
}
