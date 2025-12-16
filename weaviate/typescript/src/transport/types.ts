/**
 * Transport Layer Types and Interfaces
 *
 * Defines the core types and interfaces for HTTP transport in the Weaviate integration.
 * @module @llmdevops/weaviate-integration/transport/types
 */

import type { AuthProvider } from '../auth/types';

// ============================================================================
// HTTP Request/Response Types
// ============================================================================

/**
 * HTTP methods supported by the transport layer.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * HTTP request configuration.
 */
export interface HttpRequest {
  /** HTTP method */
  method: HttpMethod;
  /** Request path (relative to base URL) */
  path: string;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Request timeout in milliseconds (overrides default) */
  timeout?: number;
}

/**
 * HTTP response from transport.
 */
export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body */
  body: T;
  /** Raw response body text */
  text?: string;
}

/**
 * Response content type.
 */
export enum ResponseType {
  /** JSON response (parsed automatically) */
  Json = 'json',
  /** Plain text response */
  Text = 'text',
  /** Binary blob response */
  Blob = 'blob',
  /** No content expected */
  None = 'none',
}

// ============================================================================
// Transport Configuration
// ============================================================================

/**
 * Transport layer options.
 */
export interface TransportOptions {
  /** Base URL for API requests */
  baseUrl: string;
  /** Authentication provider */
  authProvider: AuthProvider;
  /** Default request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum number of retries for failed requests (default: 3) */
  maxRetries?: number;
  /** Keep-alive timeout for connections in milliseconds (default: 60000) */
  keepAliveTimeout?: number;
  /** Maximum number of sockets per host (default: 10) */
  maxSockets?: number;
  /** Additional default headers */
  defaultHeaders?: Record<string, string>;
  /** Enable request/response logging (default: false) */
  enableLogging?: boolean;
}

/**
 * Request initialization options (similar to fetch RequestInit).
 */
export interface RequestInit {
  /** Request method */
  method?: HttpMethod;
  /** Request headers */
  headers?: HeadersInit;
  /** Request body */
  body?: BodyInit | null;
  /** Abort signal */
  signal?: AbortSignal;
  /** Request credentials mode */
  credentials?: RequestCredentials;
  /** Request cache mode */
  cache?: RequestCache;
  /** Request redirect mode */
  redirect?: RequestRedirect;
  /** Request referrer */
  referrer?: string;
  /** Request integrity */
  integrity?: string;
  /** Request keepalive */
  keepalive?: boolean;
}

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * HTTP transport interface for making API requests.
 *
 * This is the core interface that all HTTP transport implementations must satisfy.
 */
export interface HttpTransport {
  /**
   * Send a generic HTTP request.
   *
   * @param request - Request configuration
   * @returns Promise resolving to HTTP response
   */
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;

  /**
   * Send a GET request.
   *
   * @param path - Request path
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;

  /**
   * Send a POST request.
   *
   * @param path - Request path
   * @param body - Request body
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  post<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;

  /**
   * Send a PUT request.
   *
   * @param path - Request path
   * @param body - Request body
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  put<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;

  /**
   * Send a PATCH request.
   *
   * @param path - Request path
   * @param body - Request body
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  patch<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;

  /**
   * Send a DELETE request.
   *
   * @param path - Request path
   * @param body - Optional request body
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  delete<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;

  /**
   * Send a HEAD request.
   *
   * @param path - Request path
   * @param query - Optional query parameters
   * @param headers - Optional additional headers
   * @returns Promise resolving to HTTP response
   */
  head(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<void>>;
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build a complete URL from base URL, path, and query parameters.
 *
 * @param baseUrl - Base URL
 * @param path - Request path
 * @param query - Optional query parameters
 * @returns Complete URL string
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  // Normalize base URL (remove trailing slash)
  const normalizedBase = baseUrl.replace(/\/$/, '');

  // Normalize path (ensure leading slash)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Build base URL
  let url = `${normalizedBase}${normalizedPath}`;

  // Add query parameters if provided
  if (query && Object.keys(query).length > 0) {
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
 * Encode query parameters into URL search params.
 *
 * @param params - Query parameters object
 * @returns URLSearchParams instance
 */
export function encodeQueryParams(
  params: Record<string, string | number | boolean | undefined>
): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  return searchParams;
}
