/**
 * Slack API Client implementation.
 */

import { SlackConfig } from '../config';
import { SlackTransport, HttpTransport, SlackApiResponse, RequestOptions } from '../transport';
import { ResponseMetadata } from '../types';

/**
 * Client options
 */
export interface ClientOptions {
  config: SlackConfig;
  transport?: HttpTransport;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Request parameters
 */
export type RequestParams = Record<string, string | number | boolean | undefined>;

/**
 * Slack API Client
 */
export class SlackClient {
  private transport: SlackTransport;
  private config: SlackConfig;

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.transport = new SlackTransport(options.config.token, options.transport);
  }

  /**
   * Create client from config
   */
  static fromConfig(config: SlackConfig): SlackClient {
    return new SlackClient({ config });
  }

  /**
   * Create client from token
   */
  static fromToken(token: string): SlackClient {
    return new SlackClient({
      config: { token, baseUrl: 'https://slack.com/api' },
    });
  }

  /**
   * Make GET request
   */
  async get<T extends SlackApiResponse>(
    endpoint: string,
    params?: RequestParams
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const response = await this.transport.request<T>(url, { method: 'GET' });
    return response.data;
  }

  /**
   * Make POST request
   */
  async post<T extends SlackApiResponse>(
    endpoint: string,
    body?: unknown,
    params?: RequestParams
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const response = await this.transport.request<T>(url, {
      method: 'POST',
      body,
    });
    return response.data;
  }

  /**
   * Make paginated request
   */
  async paginate<T, R extends SlackApiResponse & { response_metadata?: ResponseMetadata }>(
    endpoint: string,
    params: RequestParams,
    extractor: (response: R) => T[]
  ): Promise<PaginatedResponse<T>> {
    const response = await this.get<R>(endpoint, params);
    const items = extractor(response);
    const nextCursor = response.response_metadata?.next_cursor;
    const hasMore = !!nextCursor && nextCursor !== '';

    return {
      items,
      nextCursor: hasMore ? nextCursor : undefined,
      hasMore,
    };
  }

  /**
   * Iterate through all pages
   */
  async *paginateAll<T, R extends SlackApiResponse & { response_metadata?: ResponseMetadata }>(
    endpoint: string,
    params: RequestParams,
    extractor: (response: R) => T[],
    limit?: number
  ): AsyncGenerator<T[], void, unknown> {
    let cursor: string | undefined;
    let totalFetched = 0;

    do {
      const requestParams = { ...params };
      if (cursor) {
        requestParams.cursor = cursor;
      }

      const result = await this.paginate<T, R>(endpoint, requestParams, extractor);

      if (result.items.length > 0) {
        yield result.items;
        totalFetched += result.items.length;
      }

      cursor = result.nextCursor;

      if (limit && totalFetched >= limit) {
        break;
      }
    } while (cursor);
  }

  /**
   * Get all items from paginated endpoint
   */
  async getAllPages<T, R extends SlackApiResponse & { response_metadata?: ResponseMetadata }>(
    endpoint: string,
    params: RequestParams,
    extractor: (response: R) => T[],
    limit?: number
  ): Promise<T[]> {
    const allItems: T[] = [];

    for await (const items of this.paginateAll(endpoint, params, extractor, limit)) {
      allItems.push(...items);
      if (limit && allItems.length >= limit) {
        return allItems.slice(0, limit);
      }
    }

    return allItems;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: RequestParams): string {
    if (!params) {
      return endpoint;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
  }

  /**
   * Get config
   */
  getConfig(): SlackConfig {
    return this.config;
  }
}

/**
 * Create Slack client from token
 */
export function createClient(token: string): SlackClient {
  return SlackClient.fromToken(token);
}

/**
 * Create Slack client from config
 */
export function createClientFromConfig(config: SlackConfig): SlackClient {
  return SlackClient.fromConfig(config);
}
