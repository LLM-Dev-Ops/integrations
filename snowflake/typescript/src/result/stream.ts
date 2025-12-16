/**
 * Snowflake Result Stream
 *
 * Streaming interface for large result sets with pagination support.
 * @module @llmdevops/snowflake-integration/result/stream
 */

import { Readable } from 'stream';
import type { ColumnMetadata, Row, ResultSet } from '../types/index.js';
import { QueryError } from '../errors/index.js';
import { parseResultSet, type RawResultSet } from './parser.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Function to fetch a page of results.
 */
export type FetchPageFn = (
  position?: string
) => Promise<{ data: RawResultSet; hasMore: boolean; nextPosition?: string }>;

/**
 * Options for ResultStream.
 */
export interface ResultStreamOptions {
  /** Initial column metadata */
  columns?: ColumnMetadata[];
  /** Initial position for pagination */
  startPosition?: string;
  /** Page size for fetching */
  pageSize?: number;
  /** High water mark for backpressure */
  highWaterMark?: number;
}

/**
 * Result from async iterator.
 */
export interface ResultStreamItem {
  /** The row data */
  row: Row;
  /** Row index in current page */
  pageIndex: number;
  /** Total rows yielded so far */
  totalIndex: number;
}

// ============================================================================
// ResultStream Class
// ============================================================================

/**
 * Streaming interface for paginated query results.
 * Implements AsyncIterator for easy iteration over rows.
 */
export class ResultStream implements AsyncIterableIterator<Row> {
  private readonly fetchPage: FetchPageFn;
  private readonly columns?: ColumnMetadata[];
  private readonly pageSize: number;

  private currentPage: Row[] = [];
  private currentPageIndex = 0;
  private currentPosition?: string;
  private hasMore = true;
  private totalRowsYielded = 0;
  private isComplete = false;
  private error?: Error;

  /**
   * Creates a new ResultStream.
   */
  constructor(fetchPage: FetchPageFn, options: ResultStreamOptions = {}) {
    this.fetchPage = fetchPage;
    this.columns = options.columns;
    this.currentPosition = options.startPosition;
    this.pageSize = options.pageSize ?? 1000;
  }

  /**
   * Gets the current position in the result set.
   */
  get position(): string | undefined {
    return this.currentPosition;
  }

  /**
   * Gets the total number of rows yielded so far.
   */
  get rowsYielded(): number {
    return this.totalRowsYielded;
  }

  /**
   * Checks if there are more results to fetch.
   */
  get hasMoreResults(): boolean {
    return this.hasMore && !this.isComplete;
  }

  /**
   * Checks if the stream is complete.
   */
  get complete(): boolean {
    return this.isComplete;
  }

  /**
   * Fetches the next page of results.
   */
  private async fetchNextPage(): Promise<void> {
    if (!this.hasMore || this.isComplete) {
      return;
    }

    try {
      const response = await this.fetchPage(this.currentPosition);

      if (!response || !response.data) {
        throw new QueryError('Invalid response from fetch function', {
          cause: new Error('Missing data in response'),
        });
      }

      // Parse the result set
      const resultSet = parseResultSet(response.data, this.columns);

      // Update state
      this.currentPage = resultSet.rows;
      this.currentPageIndex = 0;
      this.hasMore = response.hasMore ?? false;
      this.currentPosition = response.nextPosition;

      // If no more rows in this page and no more pages, mark complete
      if (this.currentPage.length === 0 && !this.hasMore) {
        this.isComplete = true;
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.isComplete = true;
      throw this.error;
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

    // Check if we're already complete
    if (this.isComplete) {
      return { done: true, value: undefined };
    }

    // Check if we need to fetch the next page
    if (this.currentPageIndex >= this.currentPage.length) {
      if (!this.hasMore) {
        this.isComplete = true;
        return { done: true, value: undefined };
      }

      await this.fetchNextPage();

      // Check again after fetch
      if (this.currentPage.length === 0) {
        this.isComplete = true;
        return { done: true, value: undefined };
      }
    }

    // Return the next row
    const row = this.currentPage[this.currentPageIndex]!;
    this.currentPageIndex++;
    this.totalRowsYielded++;

    return { done: false, value: row };
  }

  /**
   * Implements AsyncIterator.return().
   * Allows early termination of the iteration.
   */
  async return(value?: Row): Promise<IteratorResult<Row>> {
    this.isComplete = true;
    return { done: true, value };
  }

  /**
   * Implements AsyncIterator.throw().
   * Allows error injection into the iteration.
   */
  async throw(error?: Error): Promise<IteratorResult<Row>> {
    this.error = error || new Error('Stream error');
    this.isComplete = true;
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
   * Collects all remaining rows into a ResultSet.
   */
  async toResultSet(): Promise<ResultSet> {
    const rows = await this.toArray();

    return {
      columns: this.columns || [],
      rows,
      rowCount: rows.length,
      hasMore: false,
    };
  }

  /**
   * Converts the stream to a Node.js Readable stream.
   */
  intoStream(): Readable {
    const self = this;
    let isReading = false;

    return new Readable({
      objectMode: true,
      highWaterMark: this.pageSize,

      async read() {
        // Prevent concurrent reads
        if (isReading) {
          return;
        }

        isReading = true;

        try {
          while (true) {
            const result = await self.next();

            if (result.done) {
              this.push(null);
              break;
            }

            const canContinue = this.push(result.value);
            if (!canContinue) {
              // Backpressure - stop reading
              break;
            }
          }
        } catch (error) {
          this.destroy(error instanceof Error ? error : new Error(String(error)));
        } finally {
          isReading = false;
        }
      },

      async destroy(error, callback) {
        try {
          await self.return();
          callback(error || null);
        } catch (err) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });
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
   * Executes a function for each row without collecting results.
   */
  async forEach(fn: (row: Row, index: number) => void | Promise<void>): Promise<void> {
    let index = 0;
    for await (const row of this) {
      await fn(row, index++);
    }
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

/**
 * Creates a ResultStream from a static ResultSet.
 * Useful for testing or converting existing results to streams.
 */
export function fromResultSet(resultSet: ResultSet): ResultStream {
  let fetched = false;

  const fetchPage: FetchPageFn = async () => {
    if (fetched) {
      return {
        data: { rows: [], columns: resultSet.columns },
        hasMore: false,
      };
    }

    fetched = true;
    return {
      data: {
        rows: resultSet.rows.map((row) => {
          const rawRow: Record<string, unknown> = {};
          for (let i = 0; i < resultSet.columns.length; i++) {
            const col = resultSet.columns[i]!;
            const value = row.values[i]!;
            rawRow[col.name] = value.type === 'null' ? null : value.value;
          }
          return rawRow;
        }),
        columns: resultSet.columns,
      },
      hasMore: resultSet.hasMore,
      nextPosition: resultSet.lastPosition,
    };
  };

  return new ResultStream(fetchPage, {
    columns: resultSet.columns,
  });
}
