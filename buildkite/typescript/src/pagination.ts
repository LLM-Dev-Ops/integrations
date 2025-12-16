/**
 * Pagination Support for Buildkite API
 *
 * Buildkite uses RFC 8288 Link headers for pagination similar to GitHub.
 * @module pagination
 */

/** Pagination links extracted from Link header */
export interface PaginationLinks {
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

/** Parameters for paginated requests */
export interface PaginationParams {
  perPage?: number;
  page?: number;
}

/** Type for fetching a page by URL */
export type PageFetcher<T> = (url: string) => Promise<Page<T>>;

/** Page of results with pagination metadata */
export class Page<T> {
  public readonly items: T[];
  public readonly links: PaginationLinks;
  private readonly fetcher: PageFetcher<T>;

  constructor(items: T[], links: PaginationLinks, fetcher: PageFetcher<T>) {
    this.items = items;
    this.links = links;
    this.fetcher = fetcher;
  }

  hasNext(): boolean {
    return this.links.next !== undefined;
  }

  hasPrev(): boolean {
    return this.links.prev !== undefined;
  }

  async next(): Promise<Page<T>> {
    if (!this.links.next) {
      throw new Error('No next page available');
    }
    return this.fetcher(this.links.next);
  }

  async prev(): Promise<Page<T>> {
    if (!this.links.prev) {
      throw new Error('No previous page available');
    }
    return this.fetcher(this.links.prev);
  }

  get length(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  async *pages(): AsyncIterableIterator<Page<T>> {
    let currentPage: Page<T> | null = this;
    while (currentPage !== null) {
      yield currentPage;
      if (!currentPage.hasNext()) break;
      currentPage = await currentPage.next();
    }
  }

  async collectAll(): Promise<T[]> {
    const allItems: T[] = [];
    for await (const page of this.pages()) {
      allItems.push(...page.items);
    }
    return allItems;
  }
}

/** Parse RFC 8288 Link header */
export function parseLinkHeader(linkHeader: string): PaginationLinks {
  const links: PaginationLinks = {};
  if (!linkHeader || linkHeader.trim() === '') return links;

  const parts = linkHeader.split(',').map(part => part.trim());
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match) continue;
    const [, url, rel] = match;
    switch (rel) {
      case 'next': links.next = url; break;
      case 'prev': links.prev = url; break;
      case 'first': links.first = url; break;
      case 'last': links.last = url; break;
    }
  }
  return links;
}

export function createPage<T>(items: T[], links: PaginationLinks, fetcher: PageFetcher<T>): Page<T> {
  return new Page(items, links, fetcher);
}

export function extractPageNumber(url: string): number | null {
  try {
    const parsedUrl = new URL(url);
    const pageParam = parsedUrl.searchParams.get('page');
    if (pageParam) {
      const pageNum = parseInt(pageParam, 10);
      return isNaN(pageNum) ? null : pageNum;
    }
  } catch {}
  return null;
}
