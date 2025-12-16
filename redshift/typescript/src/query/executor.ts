/**
 * Query Executor for Amazon Redshift
 *
 * Executes SQL queries with retry logic, error handling, and statistics tracking.
 * Manages session acquisition from connection pool and handles query lifecycle.
 *
 * @module @llmdevops/redshift-integration/query/executor
 */

import type { QueryResult as PgQueryResult } from 'pg';
import type { Session } from '../pool/session.js';
import {
  QueryResult,
  QueryStatistics,
  ResultSet,
  ColumnMetadata,
  RedshiftDataType,
  createRow,
  Row,
} from '../types/index.js';
import {
  RedshiftError,
  RedshiftErrorCode,
  isRetryableError,
  wrapError,
} from '../errors/index.js';
import type { Query } from './builder.js';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Query executor configuration.
 */
export interface QueryExecutorConfig {
  /** Default query timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Default query group for WLM routing */
  defaultQueryGroup?: string;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Enable audit logging */
  enableAuditLogging?: boolean;
  /** Maximum retry attempts for transient failures */
  maxRetryAttempts?: number;
  /** Initial retry delay in milliseconds */
  initialRetryDelayMs?: number;
  /** Maximum retry delay in milliseconds */
  maxRetryDelayMs?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
}

/**
 * Query execution options.
 */
export interface QueryExecutionOptions {
  /** Query timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Query group for WLM routing (overrides default) */
  queryGroup?: string;
  /** Skip retry on error */
  noRetry?: boolean;
  /** Custom session to use (skips pool acquisition) */
  session?: Session;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// ============================================================================
// QueryExecutor Class
// ============================================================================

/**
 * Executes queries against Redshift with connection pooling, retry logic,
 * and comprehensive error handling.
 *
 * @example
 * ```typescript
 * const pool = new ConnectionPool(config);
 * const executor = new QueryExecutor(pool, {
 *   defaultTimeoutMs: 30000,
 *   defaultQueryGroup: 'analytics',
 *   enableMetrics: true
 * });
 *
 * // Execute a query
 * const result = await executor.execute('SELECT * FROM users WHERE id = $1', [123]);
 *
 * // Execute with options
 * const result2 = await executor.execute(
 *   'SELECT * FROM large_table',
 *   [],
 *   { timeoutMs: 60000, queryGroup: 'long_running' }
 * );
 *
 * // Execute and get single row
 * const user = await executor.executeOne('SELECT * FROM users WHERE id = $1', [123]);
 *
 * // Execute and get multiple rows
 * const users = await executor.executeMany('SELECT * FROM users WHERE status = $1', ['active']);
 *
 * // Stream large result sets
 * for await (const row of executor.executeStream('SELECT * FROM large_table')) {
 *   console.log(row);
 * }
 * ```
 */
export class QueryExecutor {
  private readonly poolFactory: () => Promise<Session>;
  private readonly config: Required<QueryExecutorConfig>;
  private readonly retryConfig: RetryConfig;

  /**
   * Creates a new query executor.
   *
   * @param poolFactory - Function to acquire a session from the pool
   * @param config - Executor configuration
   */
  constructor(poolFactory: () => Promise<Session>, config: QueryExecutorConfig = {}) {
    this.poolFactory = poolFactory;
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
      defaultQueryGroup: config.defaultQueryGroup ?? 'default',
      enableMetrics: config.enableMetrics ?? true,
      enableAuditLogging: config.enableAuditLogging ?? false,
      maxRetryAttempts: config.maxRetryAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
      initialRetryDelayMs: config.initialRetryDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs,
      maxRetryDelayMs: config.maxRetryDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
      backoffMultiplier: config.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
    };
    this.retryConfig = {
      maxAttempts: this.config.maxRetryAttempts,
      initialDelayMs: this.config.initialRetryDelayMs,
      maxDelayMs: this.config.maxRetryDelayMs,
      backoffMultiplier: this.config.backoffMultiplier,
    };
  }

  /**
   * Executes a SQL query and returns the complete result.
   *
   * Flow:
   * 1. Acquire session from pool
   * 2. Set session parameters (timeout, query group)
   * 3. Execute query via pg.Client
   * 4. Parse results into Row objects
   * 5. Collect statistics
   * 6. Release session back to pool
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters (positional)
   * @param options - Execution options
   * @returns Promise resolving to query result
   * @throws {RedshiftError} If query execution fails
   *
   * @example
   * ```typescript
   * const result = await executor.execute(
   *   'SELECT * FROM users WHERE status = $1 AND created_at > $2',
   *   ['active', new Date('2024-01-01')]
   * );
   *
   * console.log(`Returned ${result.resultSet.rowCount} rows`);
   * console.log(`Execution time: ${result.statistics.executionTimeMs}ms`);
   * ```
   */
  async execute(
    sql: string,
    params: unknown[] = [],
    options: QueryExecutionOptions = {}
  ): Promise<QueryResult> {
    const noRetry = options.noRetry ?? false;
    const maxAttempts = noRetry ? 1 : this.retryConfig.maxAttempts;

    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeInternal(sql, params, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if not a retryable error or last attempt
        if (!isRetryableError(error) || attempt === maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    const executionTime = Date.now() - startTime;
    throw new RedshiftError(
      `Query execution failed after ${maxAttempts} attempts (${executionTime}ms): ${lastError?.message}`,
      RedshiftErrorCode.RETRY_EXHAUSTED,
      {
        cause: lastError,
        retryable: false,
        context: { attempts: maxAttempts, executionTime },
      }
    );
  }

  /**
   * Executes a query and returns a single row, or null if no rows found.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Execution options
   * @returns Promise resolving to a single row or null
   *
   * @example
   * ```typescript
   * const user = await executor.executeOne(
   *   'SELECT * FROM users WHERE id = $1',
   *   [123]
   * );
   *
   * if (user) {
   *   console.log(user.toObject(result.resultSet.columns));
   * }
   * ```
   */
  async executeOne(
    sql: string,
    params: unknown[] = [],
    options: QueryExecutionOptions = {}
  ): Promise<Row | null> {
    const result = await this.execute(sql, params, options);
    return result.resultSet.rows.length > 0 ? result.resultSet.rows[0]! : null;
  }

  /**
   * Executes a query and returns all rows as an array.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Execution options
   * @returns Promise resolving to array of rows
   *
   * @example
   * ```typescript
   * const users = await executor.executeMany(
   *   'SELECT * FROM users WHERE status = $1',
   *   ['active']
   * );
   *
   * for (const user of users) {
   *   console.log(user.toObject(columns));
   * }
   * ```
   */
  async executeMany(
    sql: string,
    params: unknown[] = [],
    options: QueryExecutionOptions = {}
  ): Promise<Row[]> {
    const result = await this.execute(sql, params, options);
    return result.resultSet.rows;
  }

  /**
   * Executes a query and streams results as an async iterable.
   *
   * This is useful for processing large result sets without loading
   * everything into memory at once.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Execution options
   * @returns Async iterable of rows
   *
   * @example
   * ```typescript
   * for await (const row of executor.executeStream('SELECT * FROM large_table')) {
   *   // Process each row individually
   *   console.log(row.toObject(columns));
   * }
   * ```
   */
  async *executeStream(
    sql: string,
    params: unknown[] = [],
    options: QueryExecutionOptions = {}
  ): AsyncIterable<Row> {
    const result = await this.execute(sql, params, options);
    for (const row of result.resultSet.rows) {
      yield row;
    }
  }

  /**
   * Executes a query using a Query object from QueryBuilder.
   *
   * @param query - Query object from QueryBuilder
   * @param options - Execution options
   * @returns Promise resolving to query result
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .select('*')
   *   .from('users')
   *   .where('status = $1', 'active')
   *   .build();
   *
   * const result = await executor.executeQuery(query);
   * ```
   */
  async executeQuery(query: Query, options: QueryExecutionOptions = {}): Promise<QueryResult> {
    return this.execute(query.sql, query.params, options);
  }

  /**
   * Internal query execution implementation.
   */
  private async executeInternal(
    sql: string,
    params: unknown[],
    options: QueryExecutionOptions
  ): Promise<QueryResult> {
    let session: Session | undefined = options.session;
    const acquiredSession = !session;

    try {
      // Acquire session from pool if not provided
      if (!session) {
        session = await this.poolFactory();
      }

      const startTime = Date.now();

      // Set session parameters
      const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs;
      const queryGroup = options.queryGroup ?? this.config.defaultQueryGroup;

      // Set query group if specified
      if (queryGroup && queryGroup !== 'default') {
        await session.setQueryGroup(queryGroup);
      }

      // Execute query with timeout
      const pgResult = await session.execute(sql, params, { timeoutMs });

      const executionTimeMs = Date.now() - startTime;

      // Convert PostgreSQL result to Redshift QueryResult
      const result = this.convertPgResult(pgResult, executionTimeMs, session.getId());

      // Audit logging
      if (this.config.enableAuditLogging) {
        this.logQuery(sql, params, result);
      }

      return result;
    } catch (error) {
      throw wrapError(error, 'Query execution failed');
    } finally {
      // Release session back to pool if we acquired it
      if (session && acquiredSession) {
        session.markIdle();
      }
    }
  }

  /**
   * Converts PostgreSQL QueryResult to Redshift QueryResult.
   */
  private convertPgResult(
    pgResult: PgQueryResult,
    executionTimeMs: number,
    sessionId: string
  ): QueryResult {
    // Extract column metadata
    const columns: ColumnMetadata[] = pgResult.fields.map((field) => ({
      name: field.name,
      type: this.mapDataType(field.dataTypeID),
      dataTypeID: field.dataTypeID,
      tableID: field.tableID,
      columnID: field.columnID,
      dataTypeModifier: field.dataTypeModifier,
      dataTypeSize: field.dataTypeSize,
      format: field.format,
    }));

    // Convert rows
    const rows: Row[] = pgResult.rows.map((rowData) => createRow(rowData, columns));

    // Create result set
    const resultSet: ResultSet = {
      columns,
      rows,
      rowCount: pgResult.rowCount ?? 0,
      command: pgResult.command,
      oid: pgResult.oid,
    };

    // Create statistics
    const statistics: QueryStatistics = {
      executionTimeMs,
      rowsReturned: pgResult.rowCount ?? 0,
      rowsAffected: pgResult.rowCount ?? undefined,
    };

    // Create query result
    return {
      queryId: `pid-${Date.now()}`, // In real implementation, this would come from pg_backend_pid()
      resultSet,
      statistics,
      sessionId,
    };
  }

  /**
   * Maps PostgreSQL data type OID to Redshift data type.
   */
  private mapDataType(oid: number): RedshiftDataType {
    // PostgreSQL OID to Redshift type mapping
    // Reference: https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat
    switch (oid) {
      case 16:
        return 'BOOLEAN';
      case 20:
        return 'BIGINT';
      case 21:
        return 'SMALLINT';
      case 23:
        return 'INTEGER';
      case 700:
        return 'REAL';
      case 701:
        return 'DOUBLE PRECISION';
      case 1700:
        return 'NUMERIC';
      case 1043:
        return 'VARCHAR';
      case 1042:
        return 'CHAR';
      case 25:
        return 'TEXT';
      case 1082:
        return 'DATE';
      case 1114:
        return 'TIMESTAMP';
      case 1184:
        return 'TIMESTAMPTZ';
      case 17:
        return 'BYTEA';
      case 114:
        return 'JSON';
      case 3802:
        return 'JSONB';
      case 2950:
        return 'UUID';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Calculates retry delay with exponential backoff.
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
      this.retryConfig.maxDelayMs
    );

    // Add jitter to prevent thundering herd (±10%)
    const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
    return Math.max(0, exponentialDelay + jitter);
  }

  /**
   * Helper method to sleep for a duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Logs query execution for audit purposes.
   */
  private logQuery(sql: string, params: unknown[], result: QueryResult): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      queryId: result.queryId,
      sessionId: result.sessionId,
      sql: sql.substring(0, 1000), // Truncate long queries
      params: params.length,
      rowCount: result.resultSet.rowCount,
      executionTimeMs: result.statistics.executionTimeMs,
    };

    // In production, this would write to a proper logging system
    if (process.env.NODE_ENV !== 'test') {
      console.log('[AUDIT]', JSON.stringify(logEntry));
    }
  }

  /**
   * Updates the executor configuration.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<QueryExecutorConfig>): void {
    Object.assign(this.config, config);
    if (config.maxRetryAttempts !== undefined) {
      this.retryConfig.maxAttempts = config.maxRetryAttempts;
    }
    if (config.initialRetryDelayMs !== undefined) {
      this.retryConfig.initialDelayMs = config.initialRetryDelayMs;
    }
    if (config.maxRetryDelayMs !== undefined) {
      this.retryConfig.maxDelayMs = config.maxRetryDelayMs;
    }
    if (config.backoffMultiplier !== undefined) {
      this.retryConfig.backoffMultiplier = config.backoffMultiplier;
    }
  }

  /**
   * Gets the current executor configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<Required<QueryExecutorConfig>> {
    return { ...this.config };
  }

  /**
   * Gets the current retry configuration.
   *
   * @returns Current retry configuration
   */
  getRetryConfig(): Readonly<RetryConfig> {
    return { ...this.retryConfig };
  }
}

/**
 * Creates a new QueryExecutor instance.
 *
 * @param poolFactory - Function to acquire a session from the pool
 * @param config - Executor configuration
 * @returns New QueryExecutor
 */
export function createQueryExecutor(
  poolFactory: () => Promise<Session>,
  config?: QueryExecutorConfig
): QueryExecutor {
  return new QueryExecutor(poolFactory, config);
}
