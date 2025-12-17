/**
 * HTTP Client for HubSpot API
 * Handles all HTTP communication with the HubSpot API using native fetch
 */

import type { HttpClientConfig } from '../types/config.js';
import { shouldRetry, calculateBackoff } from './retry.js';

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

/**
 * Request options for HTTP client
 */
export interface HttpRequestOptions {
  /** HTTP method */
  method: HttpMethod;

  /** Request endpoint (relative to baseUrl) */
  endpoint: string;

  /** Query parameters */
  params?: Record<string, string | number | boolean>;

  /** Request body (will be JSON stringified) */
  body?: unknown;

  /** Additional headers */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  statusCode: number;

  /** Response headers */
  headers: Record<string, string>;

  /** Parsed response body */
  body: T;

  /** Response OK flag */
  ok: boolean;
}

/**
 * HTTP error with additional context
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public headers?: Record<string, string>,
    public body?: unknown,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * HTTP Client for making requests to HubSpot API
 *
 * Features:
 * - Native fetch API
 * - Automatic Authorization header
 * - JSON content type
 * - Query parameter building
 * - Request timeout support
 * - Retry logic with exponential backoff
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout;
    this.maxRetries = config.retries;
    this.defaultHeaders = config.headers || {};
  }

  /**
   * Make an HTTP request with automatic retry logic
   */
  async request<T = unknown>(
    options: HttpRequestOptions,
    token?: string
  ): Promise<HttpResponse<T>> {
    let attempt = 0;
    let lastError: HttpError | Error | null = null;

    while (attempt < this.maxRetries) {
      attempt++;

      try {
        const response = await this.executeRequest<T>(options, token);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const httpError = error instanceof HttpError ? error : null;
        if (shouldRetry(httpError, attempt)) {
          const backoff = calculateBackoff(httpError, attempt);
          await this.sleep(backoff);
          continue;
        }

        // Don't retry, throw immediately
        throw error;
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    options: HttpRequestOptions,
    token?: string
  ): Promise<HttpResponse<T>> {
    // Build full URL with query parameters
    const url = this.buildUrl(options.endpoint, options.params);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    // Add authorization if token provided
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutMs = options.timeout || this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Execute fetch request
      const fetchOptions: RequestInit = {
        method: options.method,
        headers,
        signal: controller.signal,
      };

      // Add body for non-GET requests
      if (options.body && options.method !== 'GET') {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      // Parse response body
      let body: T;
      const contentType = responseHeaders['content-type'] || '';

      if (contentType.includes('application/json')) {
        const text = await response.text();
        body = text ? JSON.parse(text) : null;
      } else {
        body = (await response.text()) as unknown as T;
      }

      // Check for HTTP errors
      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          responseHeaders,
          body
        );
      }

      return {
        statusCode: response.status,
        headers: responseHeaders,
        body,
        ok: response.ok,
      };
    } catch (error) {
      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError(
          `Request timeout after ${timeoutMs}ms`,
          undefined,
          undefined,
          undefined,
          'ETIMEDOUT'
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new HttpError(
          `Network error: ${error.message}`,
          undefined,
          undefined,
          undefined,
          'ECONNRESET'
        );
      }

      // Re-throw HttpError as-is
      if (error instanceof HttpError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): string {
    const url = `${this.baseUrl}${endpoint}`;

    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value));
    }

    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
