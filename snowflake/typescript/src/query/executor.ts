/**
 * Query Executor
 *
 * Executes queries with retry logic and tracks statistics.
 * @module @llmdevops/snowflake-integration/query/executor
 */

import {
  QueryResult,
  QueryStatistics,
  AsyncQueryStatus,
  ColumnMetadata,
  createRow,
} from '../types/index.js';
import {
  QueryError,
  QueryTimeoutError,
  RetryExhaustedError,
  wrapError,
  isRetryableError,
} from '../errors/index.js';
import { Query } from './builder.js';
import { AsyncQueryHandle, createAsyncQueryHandle } from './async-handle.js';
import { toSdkBinds } from './params.js';

/**
 * Query execution function type.
 */
export type QueryExecutionFn = (
  sql: string,
  binds: unknown[] | Record<string, unknown>,
  options: QueryExecutionOptions
) => Promise<RawQueryResult>;

/**
 * Async query submission function type.
 */
export type AsyncQuerySubmissionFn = (
  sql: string,
  binds: unknown[] | Record<string, unknown>,
  options: QueryExecutionOptions
) => Promise<string>;

/**
 * Query status polling function type.
 */
export type StatusPollingFn = (queryId: string) => Promise<AsyncQueryStatus>;

/**
 * Query cancellation function type.
 */
export type QueryCancellationFn = (queryId: string) => Promise<void>;

/**
 * Raw query result from the underlying SDK.
 */
export interface RawQueryResult {
  queryId: string;
  statementHash?: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    precision?: number;
    scale?: number;
    length?: number;
  }>;
  executionTimeMs: number;
  compilationTimeMs?: number;
  queuedTimeMs?: number;
  rowsProduced: number;
  rowsAffected?: number;
  bytesScanned: number;
  bytesWritten?: number;
  bytesSent?: number;
  warehouse?: string;
  sessionId?: string;
}

/**
 * Query execution options.
 */
export interface QueryExecutionOptions {
  warehouse?: string;
  timeoutMs?: number;
  tag?: string;
  asyncExec?: boolean;
  [key: string]: unknown;
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
  /** Jitter factor (0-1) */
  jitterFactor: number;
}

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Query executor with retry logic and statistics tracking.
 */
export class QueryExecutor {
  private readonly executeFn: QueryExecutionFn;
  private readonly submitAsyncFn: AsyncQuerySubmissionFn;
  private readonly pollStatusFn: StatusPollingFn;
  private readonly cancelQueryFn: QueryCancellationFn;
  private readonly retryConfig: RetryConfig;

  /**
   * Creates a new query executor.
   *
   * @param executeFn - Function to execute synchronous queries
   * @param submitAsyncFn - Function to submit async queries
   * @param pollStatusFn - Function to poll query status
   * @param cancelQueryFn - Function to cancel queries
   * @param retryConfig - Retry configuration
   */
  constructor(
    executeFn: QueryExecutionFn,
    submitAsyncFn: AsyncQuerySubmissionFn,
    pollStatusFn: StatusPollingFn,
    cancelQueryFn: QueryCancellationFn,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.executeFn = executeFn;
    this.submitAsyncFn = submitAsyncFn;
    this.pollStatusFn = pollStatusFn;
    this.cancelQueryFn = cancelQueryFn;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Executes a query synchronously.
   *
   * @param query - The query to execute
   * @returns The query result
   */
  async execute(query: Query): Promise<QueryResult> {
    const binds = toSdkBinds(query.bindings);
    const options: QueryExecutionOptions = {
      warehouse: query.warehouse,
      timeoutMs: query.timeoutMs,
      tag: query.tag,
      asyncExec: false,
      ...query.options,
    };

    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const rawResult = await this.executeFn(query.sql, binds, options);
        return this.convertRawResult(rawResult);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if not a retryable error or last attempt
        if (!isRetryableError(error) || attempt === this.retryConfig.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    const executionTime = Date.now() - startTime;
    throw new RetryExhaustedError(this.retryConfig.maxAttempts, lastError);
  }

  /**
   * Executes a query asynchronously.
   *
   * @param query - The query to execute
   * @returns An async query handle
   */
  async executeAsync(query: Query): Promise<AsyncQueryHandle> {
    const binds = toSdkBinds(query.bindings);
    const options: QueryExecutionOptions = {
      warehouse: query.warehouse,
      timeoutMs: query.timeoutMs,
      tag: query.tag,
      asyncExec: true,
      ...query.options,
    };

    try {
      const queryId = await this.submitAsyncFn(query.sql, binds, options);
      return createAsyncQueryHandle(queryId, this.pollStatusFn, this.cancelQueryFn);
    } catch (error) {
      throw wrapError(error, 'Failed to submit async query');
    }
  }

  /**
   * Executes a query based on its execution mode.
   *
   * @param query - The query to execute
   * @returns Query result (sync) or async handle (async)
   */
  async executeQuery(query: Query): Promise<QueryResult | AsyncQueryHandle> {
    if (query.executionMode === 'async') {
      return this.executeAsync(query);
    }
    return this.execute(query);
  }

  /**
   * Converts raw query result to QueryResult.
   */
  private convertRawResult(raw: RawQueryResult): QueryResult {
    const columns: ColumnMetadata[] = raw.columns.map((col) => ({
      name: col.name,
      type: col.type as any,
      nullable: col.nullable,
      precision: col.precision,
      scale: col.scale,
      length: col.length,
    }));

    const rows = raw.rows.map((rowData) => createRow(rowData, columns));

    const statistics: QueryStatistics = {
      executionTimeMs: raw.executionTimeMs,
      compilationTimeMs: raw.compilationTimeMs,
      queuedTimeMs: raw.queuedTimeMs,
      rowsProduced: raw.rowsProduced,
      rowsAffected: raw.rowsAffected,
      bytesScanned: raw.bytesScanned,
      bytesWritten: raw.bytesWritten,
      bytesSent: raw.bytesSent,
    };

    return {
      queryId: raw.queryId,
      statementHash: raw.statementHash,
      resultSet: {
        columns,
        rows,
        rowCount: rows.length,
        hasMore: false,
      },
      statistics,
      warehouse: raw.warehouse,
      sessionId: raw.sessionId,
    };
  }

  /**
   * Calculates retry delay with exponential backoff and jitter.
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
      this.retryConfig.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.retryConfig.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, exponentialDelay + jitter);
  }

  /**
   * Helper method to sleep for a duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Updates retry configuration.
   *
   * @param config - Partial retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    Object.assign(this.retryConfig, config);
  }

  /**
   * Gets the current retry configuration.
   */
  getRetryConfig(): Readonly<RetryConfig> {
    return { ...this.retryConfig };
  }
}

/**
 * Creates a query executor.
 *
 * @param executeFn - Function to execute synchronous queries
 * @param submitAsyncFn - Function to submit async queries
 * @param pollStatusFn - Function to poll query status
 * @param cancelQueryFn - Function to cancel queries
 * @param retryConfig - Retry configuration
 * @returns A new query executor
 */
export function createQueryExecutor(
  executeFn: QueryExecutionFn,
  submitAsyncFn: AsyncQuerySubmissionFn,
  pollStatusFn: StatusPollingFn,
  cancelQueryFn: QueryCancellationFn,
  retryConfig?: Partial<RetryConfig>
): QueryExecutor {
  return new QueryExecutor(executeFn, submitAsyncFn, pollStatusFn, cancelQueryFn, retryConfig);
}
