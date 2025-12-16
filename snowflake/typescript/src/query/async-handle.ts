/**
 * Async Query Handle
 *
 * Handle for managing asynchronous query execution.
 * @module @llmdevops/snowflake-integration/query/async-handle
 */

import { QueryResult, QueryStatus, AsyncQueryStatus } from '../types/index.js';
import {
  QueryTimeoutError,
  QueryCancelledError,
  QueryError,
  wrapError,
} from '../errors/index.js';

/**
 * Function type for polling query status.
 */
export type StatusPoller = (queryId: string) => Promise<AsyncQueryStatus>;

/**
 * Function type for cancelling a query.
 */
export type QueryCanceller = (queryId: string) => Promise<void>;

/**
 * Options for waiting on async queries.
 */
export interface WaitOptions {
  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Exponential backoff multiplier (default: 1.5) */
  backoffMultiplier?: number;
  /** Maximum polling interval in milliseconds (default: 30000) */
  maxPollIntervalMs?: number;
}

/**
 * Default wait options.
 */
const DEFAULT_WAIT_OPTIONS: Required<WaitOptions> = {
  pollIntervalMs: 1000,
  backoffMultiplier: 1.5,
  maxPollIntervalMs: 30000,
};

/**
 * Handle for async query execution.
 */
export class AsyncQueryHandle {
  private readonly _queryId: string;
  private readonly statusPoller: StatusPoller;
  private readonly queryCanceller: QueryCanceller;
  private currentStatus?: AsyncQueryStatus;
  private cancelled = false;

  /**
   * Creates a new async query handle.
   *
   * @param queryId - The query ID
   * @param statusPoller - Function to poll query status
   * @param queryCanceller - Function to cancel the query
   */
  constructor(queryId: string, statusPoller: StatusPoller, queryCanceller: QueryCanceller) {
    this._queryId = queryId;
    this.statusPoller = statusPoller;
    this.queryCanceller = queryCanceller;
  }

  /**
   * Gets the query ID.
   */
  get queryId(): string {
    return this._queryId;
  }

  /**
   * Checks if the query has been cancelled.
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Polls the current status of the query.
   *
   * @returns The current query status
   */
  async poll(): Promise<AsyncQueryStatus> {
    if (this.cancelled) {
      return {
        queryId: this._queryId,
        status: { status: 'cancelled' },
      };
    }

    try {
      this.currentStatus = await this.statusPoller(this._queryId);
      return this.currentStatus;
    } catch (error) {
      throw wrapError(error, 'Failed to poll query status');
    }
  }

  /**
   * Waits for the query to complete.
   *
   * @param options - Wait options
   * @returns The query result
   * @throws QueryError if the query fails
   * @throws QueryCancelledError if the query is cancelled
   */
  async wait(options?: WaitOptions): Promise<QueryResult> {
    const opts = { ...DEFAULT_WAIT_OPTIONS, ...options };
    let pollInterval = opts.pollIntervalMs;

    while (true) {
      const status = await this.poll();

      switch (status.status.status) {
        case 'success':
          return status.status.result;

        case 'failed':
          throw new QueryError(`Query failed: ${status.status.error.message}`, {
            queryId: this._queryId,
            cause: status.status.error,
          });

        case 'cancelled':
          throw new QueryCancelledError(this._queryId);

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
   * Waits for the query to complete with a timeout.
   *
   * @param timeoutMs - Timeout in milliseconds
   * @param options - Wait options
   * @returns The query result
   * @throws QueryTimeoutError if the timeout is exceeded
   * @throws QueryError if the query fails
   * @throws QueryCancelledError if the query is cancelled
   */
  async waitWithTimeout(timeoutMs: number, options?: WaitOptions): Promise<QueryResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new QueryTimeoutError(this._queryId, timeoutMs));
      }, timeoutMs);
    });

    return Promise.race([this.wait(options), timeoutPromise]);
  }

  /**
   * Cancels the query.
   *
   * @throws QueryError if cancellation fails
   */
  async cancel(): Promise<void> {
    if (this.cancelled) {
      return;
    }

    try {
      await this.queryCanceller(this._queryId);
      this.cancelled = true;
      this.currentStatus = {
        queryId: this._queryId,
        status: { status: 'cancelled' },
      };
    } catch (error) {
      throw wrapError(error, 'Failed to cancel query');
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
   * Gets the current status without polling.
   *
   * @returns The cached status or null if not polled yet
   */
  getCurrentStatus(): AsyncQueryStatus | null {
    return this.currentStatus || null;
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
   * @returns Progress percentage (0-100) or null
   */
  async getProgress(): Promise<number | null> {
    const status = await this.poll();
    if (status.status.status === 'running' && status.status.progress !== undefined) {
      return status.status.progress;
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

/**
 * Creates an async query handle.
 *
 * @param queryId - The query ID
 * @param statusPoller - Function to poll query status
 * @param queryCanceller - Function to cancel the query
 * @returns A new async query handle
 */
export function createAsyncQueryHandle(
  queryId: string,
  statusPoller: StatusPoller,
  queryCanceller: QueryCanceller
): AsyncQueryHandle {
  return new AsyncQueryHandle(queryId, statusPoller, queryCanceller);
}
