/**
 * GitHub API Client
 *
 * Main client implementation for GitHub REST API with support for:
 * - Multiple authentication methods (PAT, GitHub App, OAuth, Actions Token)
 * - Automatic pagination with Link header parsing
 * - Rate limit tracking and handling
 * - Retry with exponential backoff
 * - Circuit breaker pattern
 * - Comprehensive error handling
 *
 * @module client
 */

import type { GitHubConfig } from './config.js';
import type { Page, PaginationParams } from './pagination.js';
import { parseLinkHeader, createPage } from './pagination.js';
import { ResilienceOrchestrator } from './resilience.js';
import {
  GitHubError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ResourceError,
  RequestError,
  ResponseError,
  ServerError,
} from './errors.js';

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * HTTP request options
 */
export interface RequestOptions {
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP response structure
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body */
  data: T;
}

/**
 * Rate limit information from GitHub API headers
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the time window */
  limit: number;
  /** Remaining requests in the time window */
  remaining: number;
  /** Unix timestamp when the rate limit resets */
  reset: number;
  /** Number of requests used in the time window */
  used: number;
  /** Rate limit resource type (core, search, graphql, etc.) */
  resource: string;
}

/**
 * Main GitHub API client interface
 */
export interface GitHubClient {
  /**
   * Make a GET request
   */
  get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;

  /**
   * Make a POST request
   */
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;

  /**
   * Make a PUT request
   */
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;

  /**
   * Make a PATCH request
   */
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;

  /**
   * Make a DELETE request
   */
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;

  /**
   * Make a paginated GET request
   */
  getPaginated<T = unknown>(
    path: string,
    params?: PaginationParams,
    options?: RequestOptions
  ): Promise<Page<T>>;

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(resource?: string): RateLimitInfo | null;

  /**
   * Get the client configuration
   */
  getConfig(): Readonly<GitHubConfig>;
}

/**
 * GitHub API client implementation
 */
export class GitHubClientImpl implements GitHubClient {
  private readonly config: GitHubConfig;
  private readonly orchestrator: ResilienceOrchestrator;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(config: GitHubConfig) {
    this.config = { ...config };
    this.baseUrl = config.baseUrl || 'https://api.github.com';
    this.apiVersion = config.apiVersion || '2022-11-28';

    // Initialize resilience orchestrator with retry and circuit breaker
    this.orchestrator = new ResilienceOrchestrator({
      maxRetries: config.maxRetries ?? 3,
      initialDelayMs: config.retryConfig?.initialDelayMs ?? 1000,
      maxDelayMs: config.retryConfig?.maxDelayMs ?? 60000,
      multiplier: config.retryConfig?.multiplier ?? 2,
      jitter: config.retryConfig?.jitter ?? true,
      circuitBreaker: {
        enabled: config.circuitBreakerConfig?.enabled ?? true,
        threshold: config.circuitBreakerConfig?.threshold ?? 5,
        resetTimeoutMs: config.circuitBreakerConfig?.resetTimeoutMs ?? 60000,
      },
      rateLimitConfig: config.rateLimitConfig,
    });
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  async getPaginated<T = unknown>(
    path: string,
    params?: PaginationParams,
    options?: RequestOptions
  ): Promise<Page<T>> {
    const queryParams = {
      ...options?.query,
      per_page: params?.perPage?.toString(),
      page: params?.page?.toString(),
    };

    const response = await this.request<T[]>(
      'GET',
      path,
      undefined,
      {
        ...options,
        query: queryParams,
      }
    );

    // Parse pagination links from Link header
    const linkHeader = response.headers.get('Link');
    const links = linkHeader ? parseLinkHeader(linkHeader) : {};

    // Create Page object with items and pagination links
    return createPage(
      response.data,
      links,
      (url: string) => this.fetchPageByUrl<T>(url)
    );
  }

  getRateLimitInfo(resource: string = 'core'): RateLimitInfo | null {
    return this.orchestrator.getRateLimitInfo(resource);
  }

  getConfig(): Readonly<GitHubConfig> {
    return { ...this.config };
  }

  /**
   * Core HTTP request method
   */
  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    // Build full URL
    const url = this.buildUrl(path, options?.query);

    // Build headers
    const headers = this.buildHeaders(options?.headers);

    // Execute request through resilience orchestrator
    try {
      const response = await this.orchestrator.execute(async () => {
        return this.performRequest<T>(method, url, headers, body, options?.timeout);
      });

      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Perform the actual HTTP request
   */
  private async performRequest<T>(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    const requestTimeout = timeout ?? this.config.timeout ?? 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Extract rate limit information from headers
      this.updateRateLimitInfo(response.headers);

      // Handle error responses
      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      // Parse response body
      const data = await this.parseResponseBody<T>(response);

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new ServerError(`Request timeout after ${requestTimeout}ms`, 408);
      }
      throw error;
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.baseUrl);

    // Add query parameters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build request headers with authentication and defaults
   */
  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.apiVersion,
      'User-Agent': this.config.userAgent || 'github-integration-ts/1.0.0',
      ...customHeaders,
    };

    // Add authentication header
    if (this.config.auth) {
      const authHeader = this.getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
    }

    return headers;
  }

  /**
   * Get authentication header value based on auth config
   */
  private getAuthHeader(): string | null {
    if (!this.config.auth) {
      return null;
    }

    const { auth } = this.config;

    // Personal Access Token
    if ('token' in auth && auth.token) {
      return `Bearer ${auth.token}`;
    }

    // GitHub App (requires JWT generation - simplified here)
    if ('appId' in auth && auth.appId) {
      // In production, this would generate a JWT or use a cached installation token
      // For now, we'll throw an error indicating implementation needed
      throw new AuthenticationError('GitHub App authentication requires JWT generation - use installation token');
    }

    // OAuth Token
    if ('oauthToken' in auth && auth.oauthToken) {
      return `Bearer ${auth.oauthToken}`;
    }

    // Actions Token
    if ('actionsToken' in auth && auth.actionsToken) {
      return `Bearer ${auth.actionsToken}`;
    }

    return null;
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');
    const used = headers.get('X-RateLimit-Used');
    const resource = headers.get('X-RateLimit-Resource') || 'core';

    if (limit && remaining && reset && used) {
      this.orchestrator.updateRateLimitInfo({
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
        used: parseInt(used, 10),
        resource,
      });
    }
  }

  /**
   * Parse response body based on content type
   */
  private async parseResponseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') || '';

    // Handle empty responses
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return undefined as T;
    }

    // Parse JSON responses
    if (contentType.includes('application/json') || contentType.includes('application/vnd.github')) {
      try {
        return await response.json();
      } catch (error) {
        throw new ResponseError(
          `Failed to parse JSON response: ${(error as Error).message}`,
          response.status
        );
      }
    }

    // Return text for other content types
    const text = await response.text();
    return text as T;
  }

  /**
   * Parse error response from GitHub API
   */
  private async parseErrorResponse(response: Response): Promise<GitHubError> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: await response.text() };
    }

    const message = errorBody.message || `HTTP ${status} error`;
    const errors = errorBody.errors;
    const documentationUrl = errorBody.documentation_url;

    // Map status codes to specific error types
    switch (status) {
      case 400:
        return new RequestError(message, errors, documentationUrl);

      case 401:
        if (message.toLowerCase().includes('bad credentials')) {
          return new AuthenticationError('Invalid authentication credentials');
        }
        if (message.toLowerCase().includes('expired')) {
          return new AuthenticationError('Authentication token has expired');
        }
        return new AuthenticationError(message);

      case 403:
        // Check for rate limiting
        if (message.toLowerCase().includes('rate limit')) {
          const retryAfter = this.parseRetryAfter(response.headers);
          const reset = response.headers.get('X-RateLimit-Reset');
          return new RateLimitError(
            message,
            parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10),
            parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10),
            reset ? parseInt(reset, 10) : undefined,
            retryAfter,
            documentationUrl
          );
        }
        // Check for abuse detection
        if (message.toLowerCase().includes('abuse')) {
          const retryAfter = this.parseRetryAfter(response.headers);
          return new RateLimitError(message, 0, 0, undefined, retryAfter, documentationUrl);
        }
        return new AuthorizationError(message);

      case 404:
        return new ResourceError('Resource not found', 404, documentationUrl);

      case 409:
        return new ResourceError('Resource conflict', 409);

      case 410:
        return new ResourceError('Resource is gone', 410);

      case 422:
        return new RequestError(`Unprocessable entity: ${message}`, errors, documentationUrl);

      case 429:
        const retryAfter = this.parseRetryAfter(response.headers);
        return new RateLimitError(message, 0, 0, undefined, retryAfter, documentationUrl);

      case 500:
      case 502:
      case 503:
      case 504:
        return new ServerError(message, status);

      default:
        return new ResponseError(message, status);
    }
  }

  /**
   * Parse Retry-After header value
   */
  private parseRetryAfter(headers: Headers): number | undefined {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds;
      }
    }
    return undefined;
  }

  /**
   * Handle errors from the orchestrator
   */
  private handleError(error: unknown): GitHubError {
    if (error instanceof GitHubError) {
      return error;
    }

    if (error instanceof Error) {
      return new ResponseError(error.message, 500);
    }

    return new ResponseError('Unknown error occurred', 500);
  }

  /**
   * Fetch a page by its full URL (used for pagination)
   */
  private async fetchPageByUrl<T>(url: string): Promise<Page<T>> {
    const response = await fetch(url, {
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw await this.parseErrorResponse(response);
    }

    this.updateRateLimitInfo(response.headers);

    const data = await this.parseResponseBody<T[]>(response);
    const linkHeader = response.headers.get('Link');
    const links = linkHeader ? parseLinkHeader(linkHeader) : {};

    return createPage(data, links, (nextUrl: string) => this.fetchPageByUrl<T>(nextUrl));
  }
}

/**
 * Create a new GitHub client instance
 */
export function createClient(config: GitHubConfig): GitHubClient {
  return new GitHubClientImpl(config);
}

/**
 * Create a GitHub client from environment variables
 */
export function createClientFromEnv(): GitHubClient {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT;

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  const oauthToken = process.env.GITHUB_OAUTH_TOKEN;
  const actionsToken = process.env.GITHUB_ACTIONS_TOKEN;

  let auth: GitHubConfig['auth'];

  // Priority: GitHub App > OAuth > Actions Token > PAT
  if (appId && privateKey) {
    auth = {
      appId: parseInt(appId, 10),
      privateKey,
      installationId: installationId ? parseInt(installationId, 10) : undefined,
    };
  } else if (oauthToken) {
    auth = { oauthToken };
  } else if (actionsToken) {
    auth = { actionsToken };
  } else if (token) {
    auth = { token };
  } else {
    throw new AuthenticationError('No GitHub authentication credentials found in environment');
  }

  const config: GitHubConfig = {
    auth,
    baseUrl: process.env.GITHUB_API_URL,
    apiVersion: process.env.GITHUB_API_VERSION,
    timeout: process.env.GITHUB_TIMEOUT ? parseInt(process.env.GITHUB_TIMEOUT, 10) : undefined,
    maxRetries: process.env.GITHUB_MAX_RETRIES ? parseInt(process.env.GITHUB_MAX_RETRIES, 10) : undefined,
  };

  return createClient(config);
}
