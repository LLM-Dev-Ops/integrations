/**
 * Redshift Result Stream
 *
 * Streaming interface for large result sets using PostgreSQL cursors.
 * @module @llmdevops/redshift-integration/result/stream
 */

import type { Client, QueryResult as PgQueryResult } from 'pg';
import type { ColumnMetadata, Row } from '../types/index.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';
import { ResultParser } from './parser.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for ResultStream.
 */
export interface StreamOptions {
  /** Batch size for fetching rows (default: 1000) */
  batchSize?: number;
  /** High water mark for backpressure (default: 10000) */
  highWaterMark?: number;
}

/**
 * Cursor state information.
 */
interface CursorState {
  /** Cursor name */
  name: string;
  /** Total rows fetched so far */
  totalFetched: number;
  /** Current position in the result set */
  position: number;
  /** Whether the cursor is exhausted */
  exhausted: boolean;
}

// ============================================================================
// ResultStream Class
// ============================================================================

/**
 * Streaming interface for large query result sets using PostgreSQL cursors.
 * Implements AsyncIterableIterator for easy iteration over rows.
 */
export class ResultStream implements AsyncIterableIterator<Row> {
  private readonly client: Client;
  private readonly cursorName: string;
  private readonly parser: ResultParser;
  private readonly batchSize: number;
  private readonly highWaterMark: number;

  private currentBatch: Row[] = [];
  private currentBatchIndex = 0;
  private totalRowsYielded = 0;
  private isExhausted = false;
  private isClosed = false;
  private error?: Error;
  private columns?: ColumnMetadata[];

  /**
   * Creates a new ResultStream.
   *
   * @param client - PostgreSQL client connection
   * @param cursorName - Name of the cursor to fetch from
   * @param options - Stream options
   */
  constructor(client: Client, cursorName: string, options: StreamOptions = {}) {
    this.client = client;
    this.cursorName = cursorName;
    this.parser = new ResultParser();
    this.batchSize = options.batchSize ?? 1000;
    this.highWaterMark = options.highWaterMark ?? 10000;
  }

  /**
   * Gets the total number of rows yielded so far.
   */
  get rowsYielded(): number {
    return this.totalRowsYielded;
  }

  /**
   * Checks if the stream is exhausted.
   */
  get exhausted(): boolean {
    return this.isExhausted;
  }

  /**
   * Checks if the stream is closed.
   */
  get closed(): boolean {
    return this.isClosed;
  }

  /**
   * Gets the column metadata (available after first fetch).
   */
  get columnMetadata(): ColumnMetadata[] | undefined {
    return this.columns;
  }

  /**
   * Fetches the next batch of rows from the cursor.
   */
  private async fetchNextBatch(): Promise<void> {
    if (this.isExhausted || this.isClosed) {
      return;
    }

    try {
      // FETCH FORWARD n FROM cursor
      const sql = `FETCH FORWARD ${this.batchSize} FROM "${this.cursorName}"`;
      const result: PgQueryResult = await this.client.query(sql);

      // Parse the result
      const parsedResult = this.parser.parseResult(result);

      // Store column metadata from first batch
      if (!this.columns && parsedResult.columns.length > 0) {
        this.columns = parsedResult.columns;
      }

      // Update batch state
      this.currentBatch = parsedResult.rows;
      this.currentBatchIndex = 0;

      // Check if cursor is exhausted
      if (this.currentBatch.length === 0) {
        this.isExhausted = true;
        await this.closeCursor();
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.isExhausted = true;
      this.isClosed = true;
      throw new RedshiftError(
        'Failed to fetch from cursor',
        RedshiftErrorCode.QUERY_FAILED,
        {
          cause: this.error,
          retryable: false,
        }
      );
    }
  }

  /**
   * Closes the cursor and releases resources.
   */
  private async closeCursor(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    try {
      // CLOSE cursor
      await this.client.query(`CLOSE "${this.cursorName}"`);
      this.isClosed = true;
    } catch (error) {
      // Ignore close errors (cursor might already be closed)
      this.isClosed = true;
    }
  }

  /**
   * Implements AsyncIterator.next().
   */
  async next(): Promise<IteratorResult<Row>> {
    // Check for previous errors
    if (this.error) {
      throw this.error;
    }

    // Check if we're already exhausted
    if (this.isExhausted) {
      return { done: true, value: undefined };
    }

    // Check if we need to fetch the next batch
    if (this.currentBatchIndex >= this.currentBatch.length) {
      if (this.currentBatch.length === 0 || this.currentBatch.length < this.batchSize) {
        // First fetch or last batch was smaller than batch size - need to fetch
        await this.fetchNextBatch();
      } else {
        // Fetch next batch
        await this.fetchNextBatch();
      }

      // Check again after fetch
      if (this.currentBatch.length === 0) {
        this.isExhausted = true;
        return { done: true, value: undefined };
      }
    }

    // Return the next row
    const row = this.currentBatch[this.currentBatchIndex]!;
    this.currentBatchIndex++;
    this.totalRowsYielded++;

    // Implement backpressure
    if (this.totalRowsYielded > this.highWaterMark) {
      // Slow down fetching by waiting a tick
      await new Promise((resolve) => setImmediate(resolve));
    }

    return { done: false, value: row };
  }

  /**
   * Implements AsyncIterator.return().
   * Allows early termination of the iteration.
   */
  async return(value?: Row): Promise<IteratorResult<Row>> {
    this.isExhausted = true;
    await this.closeCursor();
    return { done: true, value };
  }

  /**
   * Implements AsyncIterator.throw().
   * Allows error injection into the iteration.
   */
  async throw(error?: Error): Promise<IteratorResult<Row>> {
    this.error = error || new Error('Stream error');
    this.isExhausted = true;
    await this.closeCursor();
    throw this.error;
  }

  /**
   * Makes the instance iterable with for-await-of.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<Row> {
    return this;
  }

  /**
   * Collects all remaining rows into an array.
   */
  async toArray(): Promise<Row[]> {
    const rows: Row[] = [];
    for await (const row of this) {
      rows.push(row);
    }
    return rows;
  }

  /**
   * Executes a function for each row without collecting results.
   */
  async forEach(fn: (row: Row, index: number) => void | Promise<void>): Promise<void> {
    let index = 0;
    for await (const row of this) {
      await fn(row, index++);
    }
  }

  /**
   * Applies a transformation function to each row.
   */
  map<T>(fn: (row: Row, index: number) => T): AsyncIterableIterator<T> {
    const self = this;
    let index = 0;

    return {
      async next(): Promise<IteratorResult<T>> {
        const result = await self.next();
        if (result.done) {
          return { done: true, value: undefined };
        }
        const transformed = fn(result.value, index++);
        return { done: false, value: transformed };
      },

      async return(value?: T): Promise<IteratorResult<T>> {
        await self.return();
        return { done: true, value };
      },

      async throw(error?: Error): Promise<IteratorResult<T>> {
        await self.throw(error);
        throw error;
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        return this;
      },
    };
  }

  /**
   * Filters rows based on a predicate function.
   */
  filter(predicate: (row: Row, index: number) => boolean): AsyncIterableIterator<Row> {
    const self = this;
    let index = 0;

    return {
      async next(): Promise<IteratorResult<Row>> {
        while (true) {
          const result = await self.next();
          if (result.done) {
            return { done: true, value: undefined };
          }
          if (predicate(result.value, index++)) {
            return result;
          }
        }
      },

      async return(value?: Row): Promise<IteratorResult<Row>> {
        await self.return(value);
        return { done: true, value };
      },

      async throw(error?: Error): Promise<IteratorResult<Row>> {
        await self.throw(error);
        throw error;
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<Row> {
        return this;
      },
    };
  }

  /**
   * Takes only the first n rows.
   */
  take(n: number): AsyncIterableIterator<Row> {
    const self = this;
    let count = 0;

    return {
      async next(): Promise<IteratorResult<Row>> {
        if (count >= n) {
          await self.return();
          return { done: true, value: undefined };
        }
        const result = await self.next();
        if (!result.done) {
          count++;
        }
        return result;
      },

      async return(value?: Row): Promise<IteratorResult<Row>> {
        await self.return(value);
        return { done: true, value };
      },

      async throw(error?: Error): Promise<IteratorResult<Row>> {
        await self.throw(error);
        throw error;
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<Row> {
        return this;
      },
    };
  }

  /**
   * Skips the first n rows.
   */
  skip(n: number): AsyncIterableIterator<Row> {
    const self = this;
    let skipped = 0;

    return {
      async next(): Promise<IteratorResult<Row>> {
        while (skipped < n) {
          const result = await self.next();
          if (result.done) {
            return { done: true, value: undefined };
          }
          skipped++;
        }
        return await self.next();
      },

      async return(value?: Row): Promise<IteratorResult<Row>> {
        await self.return(value);
        return { done: true, value };
      },

      async throw(error?: Error): Promise<IteratorResult<Row>> {
        await self.throw(error);
        throw error;
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<Row> {
        return this;
      },
    };
  }

  /**
   * Reduces all rows to a single value.
   */
  async reduce<T>(fn: (acc: T, row: Row, index: number) => T, initial: T): Promise<T> {
    let accumulator = initial;
    let index = 0;
    for await (const row of this) {
      accumulator = fn(accumulator, row, index++);
    }
    return accumulator;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a cursor-based stream for a query.
 *
 * @param client - PostgreSQL client connection
 * @param sql - SQL query to execute
 * @param params - Optional query parameters
 * @param options - Stream options
 * @returns Promise resolving to ResultStream
 */
export async function createCursorStream(
  client: Client,
  sql: string,
  params?: unknown[],
  options: StreamOptions = {}
): Promise<ResultStream> {
  // Generate a unique cursor name
  const cursorName = `redshift_cursor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Declare cursor
    const declareSql = params && params.length > 0
      ? `DECLARE "${cursorName}" CURSOR FOR ${sql}`
      : `DECLARE "${cursorName}" CURSOR FOR ${sql}`;

    await client.query(declareSql, params);

    // Create and return stream
    return new ResultStream(client, cursorName, options);
  } catch (error) {
    throw new RedshiftError(
      'Failed to create cursor stream',
      RedshiftErrorCode.QUERY_FAILED,
      {
        cause: error instanceof Error ? error : new Error(String(error)),
        retryable: false,
      }
    );
  }
}
