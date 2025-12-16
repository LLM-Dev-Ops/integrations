/**
 * Search iterator for paginated results
 *
 * Provides an iterator interface for fetching large result sets in chunks.
 *
 * @module search/iterator
 */

import type {
  NearVectorQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchHit,
} from '../types/search.js';
import type { SearchIteratorConfig } from './types.js';
import type { SearchService } from './service.js';

/**
 * Type for queries that support pagination
 */
type PaginatedQuery = NearVectorQuery | NearTextQuery | HybridQuery | BM25Query;

/**
 * Search iterator class
 *
 * Implements an async iterator for paginated search results.
 * Fetches results in chunks and supports manual or automatic iteration.
 *
 * @example
 * ```typescript
 * const iterator = new SearchIterator(
 *   searchService,
 *   'Article',
 *   query,
 *   20 // page size
 * );
 *
 * // Manual iteration
 * while (iterator.hasMore()) {
 *   const hits = await iterator.next();
 *   console.log(`Fetched ${hits.length} results`);
 * }
 *
 * // Or use for-await
 * for await (const hits of iterator) {
 *   console.log(`Fetched ${hits.length} results`);
 * }
 * ```
 */
export class SearchIterator implements AsyncIterableIterator<SearchHit[]> {
  private readonly searchService: SearchService;
  private readonly className: string;
  private readonly baseQuery: PaginatedQuery;
  private readonly pageSize: number;
  private readonly maxResults?: number;

  private currentOffset = 0;
  private totalFetched = 0;
  private hasMoreResults = true;
  private lastPageSize = -1;

  /**
   * Creates a new search iterator
   *
   * @param searchService - Search service instance
   * @param className - Class name to search
   * @param query - Base query (will be modified with offset/limit)
   * @param pageSize - Number of results per page
   * @param maxResults - Optional maximum total results to fetch
   */
  constructor(
    searchService: SearchService,
    className: string,
    query: PaginatedQuery,
    pageSize: number,
    maxResults?: number
  ) {
    this.searchService = searchService;
    this.className = className;
    this.baseQuery = { ...query };
    this.pageSize = pageSize;
    this.maxResults = maxResults;
  }

  /**
   * Fetches the next page of results
   *
   * @returns Promise resolving to array of search hits
   */
  async next(): Promise<IteratorResult<SearchHit[]>> {
    if (!this.hasMoreResults) {
      return { done: true, value: [] };
    }

    // Calculate effective page size considering max results
    let effectivePageSize = this.pageSize;
    if (this.maxResults !== undefined) {
      const remaining = this.maxResults - this.totalFetched;
      if (remaining <= 0) {
        this.hasMoreResults = false;
        return { done: true, value: [] };
      }
      effectivePageSize = Math.min(this.pageSize, remaining);
    }

    // Create query with current offset and limit
    const query = {
      ...this.baseQuery,
      limit: effectivePageSize,
      offset: this.currentOffset,
    };

    // Execute search based on query type
    let result;
    if ('vector' in query && query.vector) {
      result = await this.searchService.nearVector(
        this.className,
        query as NearVectorQuery
      );
    } else if ('concepts' in query && query.concepts) {
      result = await this.searchService.nearText(
        this.className,
        query as NearTextQuery
      );
    } else if ('alpha' in query) {
      result = await this.searchService.hybrid(
        this.className,
        query as HybridQuery
      );
    } else {
      result = await this.searchService.bm25(
        this.className,
        query as BM25Query
      );
    }

    const hits = result.objects;
    this.lastPageSize = hits.length;
    this.currentOffset += this.lastPageSize;
    this.totalFetched += this.lastPageSize;

    // Check if there are more results
    // If we got fewer results than requested, we've reached the end
    if (this.lastPageSize < effectivePageSize) {
      this.hasMoreResults = false;
    }

    // Check if we've reached max results
    if (this.maxResults !== undefined && this.totalFetched >= this.maxResults) {
      this.hasMoreResults = false;
    }

    if (hits.length === 0) {
      return { done: true, value: [] };
    }

    return { done: false, value: hits };
  }

  /**
   * Checks if there are more results to fetch
   *
   * @returns True if more results may be available
   */
  hasMore(): boolean {
    return this.hasMoreResults;
  }

  /**
   * Resets the iterator to the beginning
   */
  reset(): void {
    this.currentOffset = 0;
    this.totalFetched = 0;
    this.hasMoreResults = true;
    this.lastPageSize = -1;
  }

  /**
   * Gets the current offset
   *
   * @returns Current offset value
   */
  getCurrentOffset(): number {
    return this.currentOffset;
  }

  /**
   * Gets the total number of results fetched so far
   *
   * @returns Total results fetched
   */
  getTotalFetched(): number {
    return this.totalFetched;
  }

  /**
   * Makes this class async iterable
   *
   * Allows using for-await-of loops
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<SearchHit[]> {
    return this;
  }

  /**
   * Collects all remaining results into an array
   *
   * Warning: This will fetch all results into memory.
   * Use with caution for large result sets.
   *
   * @returns Promise resolving to all results
   *
   * @example
   * ```typescript
   * const allResults = await iterator.collect();
   * ```
   */
  async collect(): Promise<SearchHit[]> {
    const allHits: SearchHit[] = [];

    while (this.hasMore()) {
      const result = await this.next();
      if (result.done) {
        break;
      }
      allHits.push(...result.value);
    }

    return allHits;
  }

  /**
   * Iterates through all results and calls a function for each page
   *
   * @param fn - Function to call for each page
   *
   * @example
   * ```typescript
   * await iterator.forEach(async (hits) => {
   *   console.log(`Processing ${hits.length} results`);
   *   await processHits(hits);
   * });
   * ```
   */
  async forEach(fn: (hits: SearchHit[]) => void | Promise<void>): Promise<void> {
    while (this.hasMore()) {
      const result = await this.next();
      if (result.done) {
        break;
      }
      await fn(result.value);
    }
  }
}

/**
 * Creates a search iterator
 *
 * Factory function for creating search iterators.
 *
 * @param service - Search service instance
 * @param className - Class name to search
 * @param query - Base query
 * @param config - Iterator configuration
 * @returns SearchIterator instance
 *
 * @example
 * ```typescript
 * const iterator = createSearchIterator(
 *   searchService,
 *   'Article',
 *   { vector: [0.1, 0.2, 0.3], limit: 100 },
 *   { pageSize: 20, maxResults: 100 }
 * );
 * ```
 */
export function createSearchIterator(
  service: SearchService,
  className: string,
  query: PaginatedQuery,
  config: SearchIteratorConfig
): SearchIterator {
  return new SearchIterator(
    service,
    className,
    query,
    config.pageSize,
    config.maxResults
  );
}

/**
 * Fetches all results from a query using pagination
 *
 * Utility function to fetch all results in chunks without manual iteration.
 * Warning: This loads all results into memory.
 *
 * @param service - Search service instance
 * @param className - Class name to search
 * @param query - Base query
 * @param pageSize - Number of results per page (default: 100)
 * @param maxResults - Optional maximum total results
 * @returns Promise resolving to all results
 *
 * @example
 * ```typescript
 * const allResults = await fetchAllResults(
 *   searchService,
 *   'Article',
 *   { vector: [0.1, 0.2, 0.3], limit: 1000 },
 *   100,
 *   1000
 * );
 * ```
 */
export async function fetchAllResults(
  service: SearchService,
  className: string,
  query: PaginatedQuery,
  pageSize = 100,
  maxResults?: number
): Promise<SearchHit[]> {
  const iterator = new SearchIterator(
    service,
    className,
    query,
    pageSize,
    maxResults
  );
  return iterator.collect();
}
