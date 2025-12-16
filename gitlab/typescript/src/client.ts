/**
 * GitLab API Client
 *
 * Main client implementation for interacting with the GitLab REST API.
 * Provides core HTTP methods, pagination support, rate limiting, and resilience patterns.
 */

import type { GitLabConfig } from './config.js';
import type { TokenProvider } from './auth.js';
import { EnvironmentTokenProvider } from './auth.js';
import { createConfigFromEnv } from './config.js';
import {
  ResilienceOrchestrator,
  type RateLimitInfo,
} from './resilience.js';
import { parseGitLabError, NetworkError, TimeoutError, SerializationError } from './errors.js';

/**
 * HTTP method types supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request options for API calls
 */
export interface RequestOptions {
  /**
   * Additional headers to include in the request
   */
  headers?: Record<string, string>;

  /**
   * Query parameters to append to the URL
   */
  query?: Record<string, string | number | boolean | undefined>;

  /**
   * Request timeout in milliseconds (overrides config default)
   */
  timeout?: number;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T> {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Response headers
   */
  headers: Headers;

  /**
   * Parsed response data
   */
  data: T;
}

/**
 * Pagination parameters for list requests
 */
export interface PaginationParams {
  /**
   * Page number to retrieve (1-based index)
   */
  page?: number;

  /**
   * Number of items per page (max: 100)
   */
  perPage?: number;
}

/**
 * Paginated response wrapper
 */
export interface Page<T> {
  /**
   * Items in the current page
   */
  items: T[];

  /**
   * Whether there is a next page
   */
  hasNext: boolean;

  /**
   * Whether there is a previous page
   */
  hasPrev: boolean;

  /**
   * Function to retrieve the next page (if available)
   */
  nextPage?: () => Promise<Page<T>>;

  /**
   * Function to retrieve the previous page (if available)
   */
  prevPage?: () => Promise<Page<T>>;
}

/**
 * Link header parsing result
 */
interface LinkHeader {
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

/**
 * GitLab API Client
 *
 * Main client class for interacting with the GitLab REST API.
 * Handles authentication, rate limiting, retries, and error handling.
 *
 * @example
 * ```typescript
 * import { createGitLabClient } from './client.js';
 * import { createDefaultConfig } from './config.js';
 * import { PatTokenProvider } from './auth.js';
 *
 * const config = createDefaultConfig();
 * const tokenProvider = new PatTokenProvider('your-token');
 * const client = createGitLabClient(config, tokenProvider);
 *
 * // Make a GET request
 * const response = await client.get('/projects/123');
 * console.log(response.data);
 *
 * // Get paginated results
 * const page = await client.getPaginated('/projects', { perPage: 10 });
 * for (const project of page.items) {
 *   console.log(project.name);
 * }
 *
 * // Navigate to next page
 * if (page.hasNext && page.nextPage) {
 *   const nextPage = await page.nextPage();
 *   console.log(nextPage.items);
 * }
 * ```
 */
export class GitLabClient {
  private readonly config: Readonly<GitLabConfig>;
  private readonly tokenProvider: TokenProvider;
  private readonly orchestrator: ResilienceOrchestrator;
  private readonly baseUrl: string;
  private rateLimitInfo: RateLimitInfo | null = null;

  /**
   * Creates a new GitLab API client
   *
   * @param config - GitLab configuration
   * @param tokenProvider - Token provider for authentication
   */
  constructor(config: GitLabConfig, tokenProvider: TokenProvider) {
    this.config = config;
    this.tokenProvider = tokenProvider;
    this.baseUrl = `${config.baseUrl}/api/${config.apiVersion}`;

    // Initialize resilience orchestrator
    const rateLimitConfig = {
      limit: config.rateLimitConfig.requestsPerMinute,
      remaining: config.rateLimitConfig.requestsPerMinute,
    };

    // Convert config.retryConfig to resilience.RetryConfig format if present
    const retryConfig = config.retryConfig
      ? {
          maxRetries: config.maxRetries,
          initialDelayMs: config.retryConfig.initialDelayMs,
          maxDelayMs: config.retryConfig.maxDelayMs,
          multiplier: config.retryConfig.multiplier,
          jitter: config.retryConfig.jitter,
        }
      : undefined;

    this.orchestrator = new ResilienceOrchestrator(
      rateLimitConfig,
      config.circuitBreakerConfig,
      retryConfig
    );
  }

  /**
   * Performs a GET request
   *
   * @param path - API endpoint path (e.g., '/projects/123')
   * @param options - Request options
   * @returns HTTP response with parsed data
   *
   * @example
   * ```typescript
   * const response = await client.get('/projects/123');
   * console.log(response.data.name);
   * ```
   */
  async get<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.requestInternal<T>('GET', path, undefined, options);
  }

  /**
   * Performs a POST request
   *
   * @param path - API endpoint path
   * @param body - Request body (will be JSON-serialized)
   * @param options - Request options
   * @returns HTTP response with parsed data
   *
   * @example
   * ```typescript
   * const response = await client.post('/projects', {
   *   name: 'My Project',
   *   visibility: 'private'
   * });
   * console.log(response.data.id);
   * ```
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.requestInternal<T>('POST', path, body, options);
  }

  /**
   * Performs a PUT request
   *
   * @param path - API endpoint path
   * @param body - Request body (will be JSON-serialized)
   * @param options - Request options
   * @returns HTTP response with parsed data
   *
   * @example
   * ```typescript
   * const response = await client.put('/projects/123', {
   *   description: 'Updated description'
   * });
   * console.log(response.data.description);
   * ```
   */
  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.requestInternal<T>('PUT', path, body, options);
  }

  /**
   * Performs a DELETE request
   *
   * @param path - API endpoint path
   * @param options - Request options
   * @returns HTTP response with parsed data
   *
   * @example
   * ```typescript
   * await client.delete('/projects/123');
   * ```
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.requestInternal<T>('DELETE', path, undefined, options);
  }

  /**
   * Performs a paginated GET request
   *
   * Returns a page of results with methods to navigate to next/previous pages.
   * GitLab uses the Link header for pagination.
   *
   * @param path - API endpoint path
   * @param params - Pagination parameters
   * @param options - Request options
   * @returns Page of results with navigation methods
   *
   * @example
   * ```typescript
   * // Get first page
   * const page = await client.getPaginated('/projects', { perPage: 20 });
   *
   * // Iterate through items
   * for (const project of page.items) {
   *   console.log(project.name);
   * }
   *
   * // Get next page
   * if (page.hasNext && page.nextPage) {
   *   const nextPage = await page.nextPage();
   * }
   * ```
   */
  async getPaginated<T>(
    path: string,
    params?: PaginationParams,
    options?: RequestOptions
  ): Promise<Page<T>> {
    // Build query parameters
    const query = { ...options?.query };

    if (params?.page !== undefined) {
      query['page'] = params.page;
    }
    if (params?.perPage !== undefined) {
      query['per_page'] = params.perPage;
    }

    // Make the request
    const response = await this.get<T[]>(path, {
      ...options,
      query,
    });

    // Parse Link header for pagination
    const links = this.parseLinkHeader(response.headers);

    // Create page object
    const page: Page<T> = {
      items: response.data,
      hasNext: !!links.next,
      hasPrev: !!links.prev,
    };

    // Add navigation methods if links exist
    if (links.next) {
      page.nextPage = () => this.fetchPageByUrl<T>(links.next!);
    }
    if (links.prev) {
      page.prevPage = () => this.fetchPageByUrl<T>(links.prev!);
    }

    return page;
  }

  /**
   * Get the current configuration
   *
   * @returns Readonly configuration object
   */
  getConfig(): Readonly<GitLabConfig> {
    return this.config;
  }

  /**
   * Get an authentication token for making raw API requests
   *
   * This method is intended for service implementations that need to make
   * non-JSON requests (e.g., downloading binary artifacts, streaming logs).
   *
   * @returns Promise resolving to an authentication token
   * @internal
   */
  async getAuthToken(): Promise<string> {
    return await this.tokenProvider.getToken();
  }

  /**
   * Get current rate limit information
   *
   * Returns null if no requests have been made yet.
   *
   * @returns Rate limit info or null
   *
   * @example
   * ```typescript
   * const rateLimit = client.getRateLimitInfo();
   * if (rateLimit) {
   *   console.log(`Remaining: ${rateLimit.remaining}/${rateLimit.limit}`);
   *   console.log(`Resets at: ${new Date(rateLimit.reset * 1000)}`);
   * }
   * ```
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Unified request method for service layer compatibility
   *
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param options - Request options including body and query params
   * @returns Response data
   *
   * @example
   * ```typescript
   * const data = await client.request('GET', '/projects/123');
   * const created = await client.request('POST', '/projects/123/issues', {
   *   body: { title: 'New issue' }
   * });
   * ```
   */
  async request<T>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, unknown>;
    }
  ): Promise<T> {
    // Convert params to query format
    const query: Record<string, string | number | boolean | undefined> = {};
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            query[key] = value;
          } else {
            query[key] = String(value);
          }
        }
      }
    }

    const requestOptions: RequestOptions = {
      query: Object.keys(query).length > 0 ? query : undefined,
    };

    const response = await this.requestInternal<T>(method, path, options?.body, requestOptions);
    return response.data;
  }

  /**
   * Core request method (internal)
   *
   * Handles authentication, rate limiting, retries, error parsing, and response handling.
   *
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param body - Request body (for POST/PUT/PATCH)
   * @param options - Request options
   * @returns HTTP response with parsed data
   */
  private async requestInternal<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    // Build the full URL
    const url = this.buildUrl(path, options?.query);

    // Execute through resilience orchestrator
    return this.orchestrator.execute(async () => {
      // Get authentication token
      const token = await this.tokenProvider.getToken();

      // Build headers
      const headers: Record<string, string> = {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
        ...options?.headers,
      };

      // Add user agent if configured
      if (this.config.userAgent) {
        headers['User-Agent'] = this.config.userAgent;
      }

      // Determine timeout
      const timeout = options?.timeout ?? this.config.timeout;

      // Build fetch options
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(timeout),
      };

      // Add body if present
      if (body !== undefined) {
        try {
          fetchOptions.body = JSON.stringify(body);
        } catch (error) {
          throw new SerializationError(
            'Failed to serialize request body',
            error instanceof Error ? error : undefined
          );
        }
      }

      // Make the request
      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (error) {
        // Handle network errors and timeouts
        if (error instanceof Error) {
          if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new TimeoutError(
              `Request timeout after ${timeout}ms`,
              error
            );
          }
          throw new NetworkError(
            `Network request failed: ${error.message}`,
            error
          );
        }
        throw error;
      }

      // Update rate limit from response headers
      this.updateRateLimitFromHeaders(response.headers);

      // Check for error response
      if (!response.ok) {
        // Parse error body
        let errorBody: unknown;
        try {
          const contentType = response.headers.get('Content-Type') || '';
          if (contentType.includes('application/json')) {
            errorBody = await response.json();
          } else {
            errorBody = await response.text();
          }
        } catch {
          errorBody = undefined;
        }

        // Throw appropriate error
        throw parseGitLabError(response.status, errorBody, response.headers);
      }

      // Parse response body
      let data: T;
      try {
        const contentType = response.headers.get('Content-Type') || '';

        if (response.status === 204 || response.status === 205) {
          // No content
          data = undefined as T;
        } else if (contentType.includes('application/json')) {
          data = (await response.json()) as T;
        } else {
          // Return text for non-JSON responses
          data = (await response.text()) as T;
        }
      } catch (error) {
        throw new SerializationError(
          'Failed to parse response body',
          error instanceof Error ? error : undefined
        );
      }

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    });
  }

  /**
   * Build a full URL from path and query parameters
   *
   * @param path - API endpoint path
   * @param query - Query parameters
   * @returns Full URL
   */
  buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${this.baseUrl}${normalizedPath}`;

    // Add query parameters
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Update rate limit information from response headers
   *
   * GitLab uses the following headers:
   * - RateLimit-Limit: Maximum requests allowed
   * - RateLimit-Remaining: Requests remaining in current window
   * - RateLimit-Reset: Unix timestamp when the limit resets
   *
   * @param headers - Response headers
   */
  private updateRateLimitFromHeaders(headers: Headers): void {
    // Update orchestrator's rate limiter
    this.orchestrator.updateRateLimitFromHeaders(headers);

    // Store rate limit info for external access
    const limit = headers.get('RateLimit-Limit');
    const remaining = headers.get('RateLimit-Remaining');
    const reset = headers.get('RateLimit-Reset');

    if (limit && remaining && reset) {
      this.rateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }
  }

  /**
   * Parse Link header for pagination
   *
   * GitLab uses RFC 5988 Link headers for pagination:
   * Link: <url>; rel="next", <url>; rel="prev", <url>; rel="first", <url>; rel="last"
   *
   * @param headers - Response headers
   * @returns Parsed link URLs
   */
  private parseLinkHeader(headers: Headers): LinkHeader {
    const linkHeader = headers.get('Link');
    if (!linkHeader) {
      return {};
    }

    const links: LinkHeader = {};
    const parts = linkHeader.split(',');

    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) {
        const url = match[1];
        const rel = match[2];

        if (rel === 'next' || rel === 'prev' || rel === 'first' || rel === 'last') {
          links[rel] = url;
        }
      }
    }

    return links;
  }

  /**
   * Fetch a page using a full URL from Link header
   *
   * @param url - Full URL to fetch
   * @returns Page of results
   */
  private async fetchPageByUrl<T>(url: string): Promise<Page<T>> {
    // Extract path and query from URL
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(`/api/${this.config.apiVersion}`, '');
    const query: Record<string, string> = {};

    // Extract query parameters
    urlObj.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Make request
    const response = await this.get<T[]>(path, { query });

    // Parse Link header
    const links = this.parseLinkHeader(response.headers);

    // Create page object
    const page: Page<T> = {
      items: response.data,
      hasNext: !!links.next,
      hasPrev: !!links.prev,
    };

    // Add navigation methods
    if (links.next) {
      page.nextPage = () => this.fetchPageByUrl<T>(links.next!);
    }
    if (links.prev) {
      page.prevPage = () => this.fetchPageByUrl<T>(links.prev!);
    }

    return page;
  }
}

/**
 * Factory function to create a GitLab client
 *
 * @param config - GitLab configuration
 * @param tokenProvider - Token provider for authentication
 * @returns GitLab client instance
 *
 * @example
 * ```typescript
 * import { createGitLabClient } from './client.js';
 * import { createDefaultConfig } from './config.js';
 * import { PatTokenProvider } from './auth.js';
 *
 * const config = createDefaultConfig();
 * const tokenProvider = new PatTokenProvider('your-token');
 * const client = createGitLabClient(config, tokenProvider);
 * ```
 */
export function createGitLabClient(
  config: GitLabConfig,
  tokenProvider: TokenProvider
): GitLabClient {
  return new GitLabClient(config, tokenProvider);
}

/**
 * Factory function to create a GitLab client from environment variables
 *
 * Reads configuration from environment variables and uses EnvironmentTokenProvider
 * for authentication.
 *
 * Environment variables:
 * - GITLAB_TOKEN: GitLab personal access token (required)
 * - GITLAB_BASE_URL: GitLab instance URL (default: https://gitlab.com)
 * - GITLAB_API_VERSION: API version (default: v4)
 * - GITLAB_TIMEOUT: Request timeout in milliseconds (default: 30000)
 * - GITLAB_MAX_RETRIES: Maximum retry attempts (default: 3)
 *
 * @returns GitLab client instance
 * @throws Error if GITLAB_TOKEN is not set
 *
 * @example
 * ```typescript
 * import { createGitLabClientFromEnv } from './client.js';
 *
 * // Ensure GITLAB_TOKEN is set in environment
 * const client = createGitLabClientFromEnv();
 *
 * // Use the client
 * const projects = await client.get('/projects');
 * ```
 */
export function createGitLabClientFromEnv(): GitLabClient {
  const config = createConfigFromEnv();
  const tokenProvider = new EnvironmentTokenProvider('GITLAB_TOKEN');
  return new GitLabClient(config, tokenProvider);
}
