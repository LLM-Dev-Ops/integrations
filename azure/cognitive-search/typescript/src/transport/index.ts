/**
 * Azure Cognitive Search HTTP Transport
 *
 * HTTP client for making requests to Azure Cognitive Search REST API.
 */

import type { AuthProvider, AuthHeader } from '../auth/index.js';
import type { NormalizedAcsConfig } from '../client/config.js';
import { mapStatusToError, TimeoutError, ConnectionFailedError } from '../errors/index.js';

/** HTTP method type */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** HTTP request options */
export interface HttpRequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** HTTP response */
export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
  requestId?: string;
}

/**
 * HTTP transport for Azure Cognitive Search
 */
export class HttpTransport {
  private readonly config: NormalizedAcsConfig;
  private readonly authProvider: AuthProvider;

  constructor(config: NormalizedAcsConfig, authProvider: AuthProvider) {
    this.config = config;
    this.authProvider = authProvider;
  }

  /** Make an HTTP request */
  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const url = this.buildUrl(options.path, options.queryParams);
    const timeout = options.timeout ?? this.config.timeout;

    // Get auth header
    const [authHeaderName, authHeaderValue] = await this.authProvider.getAuthHeader();

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [authHeaderName]: authHeaderValue,
      ...options.headers,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Merge signals if provided
    const signal = options.signal
      ? this.mergeSignals(options.signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      const requestId = responseHeaders['x-ms-request-id'];

      // Parse response body
      let data: T;
      const contentType = responseHeaders['content-type'] ?? '';
      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      // Check for errors
      if (!response.ok) {
        const errorMessage = this.extractErrorMessage(data) ?? response.statusText;
        const retryAfter = this.parseRetryAfter(responseHeaders['retry-after']);
        throw mapStatusToError(response.status, errorMessage, {
          requestId,
          retryAfterMs: retryAfter,
        });
      }

      return {
        status: response.status,
        headers: responseHeaders,
        data,
        requestId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(timeout);
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new ConnectionFailedError(url);
        }
      }

      throw error;
    }
  }

  /** Build URL with query parameters */
  private buildUrl(path: string, queryParams?: Record<string, string | number | boolean | undefined>): string {
    const baseUrl = `${this.config.endpoint}${path}`;
    const params = new URLSearchParams();

    // Always include api-version
    params.set('api-version', this.config.apiVersion);

    // Add additional query params
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /** Merge abort signals */
  private mergeSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const onAbort = () => controller.abort();

    signal1.addEventListener('abort', onAbort);
    signal2.addEventListener('abort', onAbort);

    if (signal1.aborted || signal2.aborted) {
      controller.abort();
    }

    return controller.signal;
  }

  /** Extract error message from response */
  private extractErrorMessage(data: unknown): string | undefined {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj['error'] === 'object' && obj['error'] !== null) {
        const error = obj['error'] as Record<string, unknown>;
        if (typeof error['message'] === 'string') {
          return error['message'];
        }
      }
      if (typeof obj['message'] === 'string') {
        return obj['message'];
      }
    }
    return undefined;
  }

  /** Parse Retry-After header */
  private parseRetryAfter(value?: string): number | undefined {
    if (!value) return undefined;

    // Try parsing as seconds
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return undefined;
  }
}

/** Create HTTP transport */
export function createTransport(config: NormalizedAcsConfig, authProvider: AuthProvider): HttpTransport {
  return new HttpTransport(config, authProvider);
}
