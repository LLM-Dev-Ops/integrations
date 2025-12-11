/**
 * Pagination Support for GitHub API
 *
 * GitHub uses RFC 8288 Link headers for pagination:
 * Link: <https://api.github.com/resource?page=2>; rel="next",
 *       <https://api.github.com/resource?page=5>; rel="last"
 *
 * This module provides:
 * - Link header parsing according to RFC 8288
 * - Page<T> class for paginated results with navigation
 * - PageIterator for async iteration over all pages
 * - Utility functions for working with paginated data
 *
 * @module pagination
 */

/**
 * Pagination links extracted from Link header
 */
export interface PaginationLinks {
  /** URL for the next page of results */
  next?: string;
  /** URL for the previous page of results */
  prev?: string;
  /** URL for the first page of results */
  first?: string;
  /** URL for the last page of results */
  last?: string;
}

/**
 * Parameters for paginated requests
 */
export interface PaginationParams {
  /** Number of items per page (default: 30, max: 100) */
  perPage?: number;
  /** Page number to fetch (1-indexed) */
  page?: number;
}

/**
 * Type for fetching a page by URL
 */
export type PageFetcher<T> = (url: string) => Promise<Page<T>>;

/**
 * Page of results with pagination metadata
 */
export class Page<T> {
  /**
   * Items in the current page
   */
  public readonly items: T[];

  /**
   * Pagination links
   */
  public readonly links: PaginationLinks;

  /**
   * Page fetcher function for navigation
   */
  private readonly fetcher: PageFetcher<T>;

  constructor(items: T[], links: PaginationLinks, fetcher: PageFetcher<T>) {
    this.items = items;
    this.links = links;
    this.fetcher = fetcher;
  }

  /**
   * Check if there is a next page
   */
  hasNext(): boolean {
    return this.links.next !== undefined;
  }

  /**
   * Check if there is a previous page
   */
  hasPrev(): boolean {
    return this.links.prev !== undefined;
  }

  /**
   * Check if there is a first page link
   */
  hasFirst(): boolean {
    return this.links.first !== undefined;
  }

  /**
   * Check if there is a last page link
   */
  hasLast(): boolean {
    return this.links.last !== undefined;
  }

  /**
   * Fetch the next page
   * @throws Error if there is no next page
   */
  async next(): Promise<Page<T>> {
    if (!this.links.next) {
      throw new Error('No next page available');
    }
    return this.fetcher(this.links.next);
  }

  /**
   * Fetch the previous page
   * @throws Error if there is no previous page
   */
  async prev(): Promise<Page<T>> {
    if (!this.links.prev) {
      throw new Error('No previous page available');
    }
    return this.fetcher(this.links.prev);
  }

  /**
   * Fetch the first page
   * @throws Error if there is no first page link
   */
  async first(): Promise<Page<T>> {
    if (!this.links.first) {
      throw new Error('No first page link available');
    }
    return this.fetcher(this.links.first);
  }

  /**
   * Fetch the last page
   * @throws Error if there is no last page link
   */
  async last(): Promise<Page<T>> {
    if (!this.links.last) {
      throw new Error('No last page link available');
    }
    return this.fetcher(this.links.last);
  }

  /**
   * Transform page items using a mapping function
   */
  map<U>(fn: (item: T, index: number) => U): Page<U> {
    const mappedItems = this.items.map(fn);
    // Create a new fetcher that transforms fetched pages
    const mappedFetcher: PageFetcher<U> = async (url: string) => {
      const page = await this.fetcher(url);
      return page.map(fn);
    };
    return new Page(mappedItems, this.links, mappedFetcher);
  }

  /**
   * Filter page items using a predicate function
   */
  filter(predicate: (item: T, index: number) => boolean): Page<T> {
    const filteredItems = this.items.filter(predicate);
    return new Page(filteredItems, this.links, this.fetcher);
  }

  /**
   * Get the number of items in this page
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * Check if the page is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Create an async iterator over all pages starting from this page
   */
  async *pages(): AsyncIterableIterator<Page<T>> {
    let currentPage: Page<T> | null = this;

    while (currentPage !== null) {
      yield currentPage;

      if (!currentPage.hasNext()) {
        break;
      }

      currentPage = await currentPage.next();
    }
  }

  /**
   * Create an async iterator over all items starting from this page
   */
  async *items(): AsyncIterableIterator<T> {
    for await (const page of this.pages()) {
      for (const item of page.items) {
        yield item;
      }
    }
  }

  /**
   * Collect all items from this page onwards into an array
   * WARNING: This will fetch all remaining pages and can be expensive
   */
  async collectAll(): Promise<T[]> {
    const allItems: T[] = [];

    for await (const item of this.items()) {
      allItems.push(item);
    }

    return allItems;
  }

  /**
   * Get the first N items from this page onwards
   */
  async take(count: number): Promise<T[]> {
    const items: T[] = [];

    for await (const item of this.items()) {
      if (items.length >= count) {
        break;
      }
      items.push(item);
    }

    return items;
  }
}

/**
 * Parse GitHub Link header according to RFC 8288
 *
 * Link header format:
 * <url1>; rel="next", <url2>; rel="last", <url3>; rel="first", <url4>; rel="prev"
 *
 * Example:
 * ```
 * Link: <https://api.github.com/repositories?page=2>; rel="next",
 *       <https://api.github.com/repositories?page=5>; rel="last"
 * ```
 *
 * @param linkHeader - The Link header value
 * @returns Parsed pagination links
 */
export function parseLinkHeader(linkHeader: string): PaginationLinks {
  const links: PaginationLinks = {};

  if (!linkHeader || linkHeader.trim() === '') {
    return links;
  }

  // Split by comma to get individual link entries
  const parts = linkHeader.split(',').map(part => part.trim());

  for (const part of parts) {
    // Match pattern: <url>; rel="type"
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);

    if (!match) {
      continue;
    }

    const [, url, rel] = match;

    // Map rel types to our interface
    switch (rel) {
      case 'next':
        links.next = url;
        break;
      case 'prev':
        links.prev = url;
        break;
      case 'first':
        links.first = url;
        break;
      case 'last':
        links.last = url;
        break;
    }
  }

  return links;
}

/**
 * Create a Page instance
 */
export function createPage<T>(
  items: T[],
  links: PaginationLinks,
  fetcher: PageFetcher<T>
): Page<T> {
  return new Page(items, links, fetcher);
}

/**
 * Page iterator for manual pagination control
 */
export class PageIterator<T> implements AsyncIterableIterator<Page<T>> {
  private currentPage: Page<T> | null;
  private done: boolean = false;

  constructor(initialPage: Page<T>) {
    this.currentPage = initialPage;
  }

  async next(): Promise<IteratorResult<Page<T>>> {
    if (this.done || !this.currentPage) {
      return { done: true, value: undefined };
    }

    const page = this.currentPage;

    // Try to advance to next page
    if (page.hasNext()) {
      try {
        this.currentPage = await page.next();
      } catch (error) {
        this.done = true;
        throw error;
      }
    } else {
      this.done = true;
      this.currentPage = null;
    }

    return { done: false, value: page };
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Page<T>> {
    return this;
  }
}

/**
 * Extract page number from a pagination URL
 */
export function extractPageNumber(url: string): number | null {
  try {
    const parsedUrl = new URL(url);
    const pageParam = parsedUrl.searchParams.get('page');
    if (pageParam) {
      const pageNum = parseInt(pageParam, 10);
      return isNaN(pageNum) ? null : pageNum;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract per_page parameter from a pagination URL
 */
export function extractPerPage(url: string): number | null {
  try {
    const parsedUrl = new URL(url);
    const perPageParam = parsedUrl.searchParams.get('per_page');
    if (perPageParam) {
      const perPage = parseInt(perPageParam, 10);
      return isNaN(perPage) ? null : perPage;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Build pagination query parameters
 */
export function buildPaginationParams(params?: PaginationParams): Record<string, string> {
  const queryParams: Record<string, string> = {};

  if (params?.perPage !== undefined) {
    // GitHub max per_page is 100
    const perPage = Math.min(params.perPage, 100);
    queryParams.per_page = perPage.toString();
  }

  if (params?.page !== undefined) {
    queryParams.page = params.page.toString();
  }

  return queryParams;
}

/**
 * Calculate total pages from a last page URL
 */
export function calculateTotalPages(lastPageUrl: string | undefined): number | null {
  if (!lastPageUrl) {
    return null;
  }

  const pageNum = extractPageNumber(lastPageUrl);
  return pageNum;
}

/**
 * Check if pagination links indicate more pages are available
 */
export function hasMorePages(links: PaginationLinks): boolean {
  return links.next !== undefined;
}

/**
 * Async generator function to iterate over all pages
 */
export async function* iteratePages<T>(initialPage: Page<T>): AsyncIterableIterator<Page<T>> {
  let currentPage: Page<T> | null = initialPage;

  while (currentPage !== null) {
    yield currentPage;

    if (!currentPage.hasNext()) {
      break;
    }

    currentPage = await currentPage.next();
  }
}

/**
 * Async generator function to iterate over all items across pages
 */
export async function* iterateItems<T>(initialPage: Page<T>): AsyncIterableIterator<T> {
  for await (const page of iteratePages(initialPage)) {
    for (const item of page.items) {
      yield item;
    }
  }
}

/**
 * Collect all pages into an array
 * WARNING: This will fetch all pages and can be expensive
 */
export async function collectAllPages<T>(initialPage: Page<T>): Promise<Page<T>[]> {
  const pages: Page<T>[] = [];

  for await (const page of iteratePages(initialPage)) {
    pages.push(page);
  }

  return pages;
}

/**
 * Collect all items across all pages into an array
 * WARNING: This will fetch all pages and can be expensive
 */
export async function collectAllItems<T>(initialPage: Page<T>): Promise<T[]> {
  const items: T[] = [];

  for await (const item of iterateItems(initialPage)) {
    items.push(item);
  }

  return items;
}
