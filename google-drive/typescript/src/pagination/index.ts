/**
 * Pagination utilities for Google Drive integration.
 */

export interface Paginated<T> {
  items: T[];
  nextPageToken?: string;
  hasNext(): boolean;
}

export class PaginatedResult<T> implements Paginated<T> {
  constructor(
    public items: T[],
    public nextPageToken?: string
  ) {}

  hasNext(): boolean {
    return this.nextPageToken !== undefined && this.nextPageToken !== null;
  }
}

export interface PageIteratorOptions<T> {
  pageSize?: number;
  fetchPage: (pageToken?: string) => Promise<{ items: T[]; nextPageToken?: string }>;
}

export class PageIterator<T> implements AsyncIterable<T> {
  private options: PageIteratorOptions<T>;
  private currentToken?: string;
  private exhausted = false;

  constructor(options: PageIteratorOptions<T>) {
    this.options = options;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (!this.exhausted) {
      const page = await this.nextPage();
      if (!page || page.length === 0) {
        break;
      }
      for (const item of page) {
        yield item;
      }
    }
  }

  async nextPage(): Promise<T[] | null> {
    if (this.exhausted) {
      return null;
    }

    const result = await this.options.fetchPage(this.currentToken);
    
    if (result.nextPageToken) {
      this.currentToken = result.nextPageToken;
    } else {
      this.exhausted = true;
    }

    return result.items;
  }

  async collectAll(maxItems?: number): Promise<T[]> {
    const items: T[] = [];
    let count = 0;

    for await (const item of this) {
      items.push(item);
      count++;
      if (maxItems && count >= maxItems) {
        break;
      }
    }

    return items;
  }
}

export interface PaginationParams {
  pageSize?: number;
  pageToken?: string;
  maxPages?: number;
}

export async function collectAll<T>(
  iterator: AsyncIterable<T>,
  maxItems?: number
): Promise<T[]> {
  const items: T[] = [];
  let count = 0;

  for await (const item of iterator) {
    items.push(item);
    count++;
    if (maxItems && count >= maxItems) {
      break;
    }
  }

  return items;
}

export function createPageIterator<T>(
  fetchPage: (pageToken?: string) => Promise<{ items: T[]; nextPageToken?: string }>,
  pageSize?: number
): PageIterator<T> {
  return new PageIterator({ fetchPage, pageSize });
}
