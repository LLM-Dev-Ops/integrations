/**
 * HTTP types for AWS SES API communication.
 *
 * This module provides type definitions for HTTP requests and responses,
 * including client configuration options.
 *
 * @module http/types
 */

/**
 * HTTP methods supported by the SES API.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * HTTP request structure.
 *
 * Represents a complete HTTP request with all necessary components
 * for making an API call.
 *
 * @example
 * ```typescript
 * const request: HttpRequest = {
 *   method: 'POST',
 *   url: 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': 'AWS4-HMAC-SHA256 ...'
 *   },
 *   body: JSON.stringify({ /* email data *\/ })
 * };
 * ```
 */
export interface HttpRequest {
  /**
   * HTTP method (GET, POST, PUT, DELETE, PATCH).
   */
  method: HttpMethod;

  /**
   * Complete URL including protocol, host, path, and query string.
   */
  url: string;

  /**
   * HTTP headers as key-value pairs.
   * Header names are case-insensitive but typically lowercase.
   */
  headers: Record<string, string>;

  /**
   * Request body as a string.
   * Typically JSON for AWS SES API calls.
   */
  body?: string;
}

/**
 * HTTP response structure.
 *
 * Represents a complete HTTP response including status, headers, and body.
 *
 * @example
 * ```typescript
 * const response: HttpResponse = {
 *   status: 200,
 *   headers: {
 *     'content-type': 'application/json',
 *     'x-amzn-requestid': 'abc-123'
 *   },
 *   body: '{"MessageId":"msg-456"}'
 * };
 * ```
 */
export interface HttpResponse {
  /**
   * HTTP status code (e.g., 200, 400, 500).
   */
  status: number;

  /**
   * Response headers as key-value pairs.
   * Header names are normalized to lowercase.
   */
  headers: Record<string, string>;

  /**
   * Response body as a string.
   * Empty string if no body is present.
   */
  body: string;
}

/**
 * HTTP client configuration options.
 *
 * Controls timeout behavior and connection management for HTTP requests.
 *
 * @example
 * ```typescript
 * const config: HttpClientConfig = {
 *   timeout: 30000,        // 30 second request timeout
 *   connectTimeout: 10000, // 10 second connection timeout
 *   keepAlive: true        // Enable HTTP keep-alive
 * };
 * ```
 */
export interface HttpClientConfig {
  /**
   * Total request timeout in milliseconds.
   * Includes connection time, request/response transfer, and processing.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Connection establishment timeout in milliseconds.
   * How long to wait when establishing a TCP connection.
   *
   * @default 10000 (10 seconds)
   */
  connectTimeout?: number;

  /**
   * Enable HTTP keep-alive for connection reuse.
   * When enabled, connections are reused for multiple requests.
   *
   * @default true
   */
  keepAlive?: boolean;
}

/**
 * Options for connection pooling.
 *
 * Controls how connections are pooled and reused for optimal performance.
 *
 * @example
 * ```typescript
 * const poolOptions: PoolOptions = {
 *   maxIdlePerHost: 10,
 *   idleTimeout: 90000,
 *   maxLifetime: 300000
 * };
 * ```
 */
export interface PoolOptions {
  /**
   * Maximum number of idle connections to maintain per host.
   *
   * @default 10
   */
  maxIdlePerHost?: number;

  /**
   * How long (in milliseconds) an idle connection can remain in the pool
   * before being closed.
   *
   * @default 90000 (90 seconds)
   */
  idleTimeout?: number;

  /**
   * Maximum lifetime (in milliseconds) for a connection.
   * Connections are closed after this time regardless of activity.
   *
   * @default 300000 (5 minutes)
   */
  maxLifetime?: number;
}

/**
 * Statistics about connection pool usage.
 *
 * Provides metrics for monitoring and debugging connection pool behavior.
 *
 * @example
 * ```typescript
 * const stats = pool.stats();
 * console.log(`Active: ${stats.activeConnections}`);
 * console.log(`Reuse rate: ${stats.reuseRate()}%`);
 * ```
 */
export interface PoolStats {
  /**
   * Current number of active (in-use) connections.
   */
  activeConnections: number;

  /**
   * Total number of connections created since pool initialization.
   */
  totalConnections: number;

  /**
   * Number of times connections have been reused.
   */
  connectionReuses: number;

  /**
   * Number of available connection permits.
   */
  availablePermits: number;

  /**
   * Maximum number of idle connections per host.
   */
  maxIdlePerHost: number;
}

/**
 * AWS error response structure.
 *
 * Represents the JSON structure of AWS API error responses.
 *
 * @internal
 */
export interface AwsErrorResponse {
  /**
   * Error type (e.g., "MessageRejected", "Throttling").
   */
  __type?: string;

  /**
   * Human-readable error message.
   */
  message?: string;

  /**
   * Additional error details.
   */
  [key: string]: unknown;
}

/**
 * Paginated response structure.
 *
 * Many AWS SES API operations return paginated results.
 *
 * @template T - The type of items in the response
 *
 * @example
 * ```typescript
 * interface Identity {
 *   IdentityName: string;
 *   IdentityType: string;
 * }
 *
 * const response: PaginatedResponse<Identity> = {
 *   items: [
 *     { IdentityName: 'example.com', IdentityType: 'DOMAIN' }
 *   ],
 *   nextToken: 'abc123'
 * };
 * ```
 */
export interface PaginatedResponse<T> {
  /**
   * Array of items in the current page.
   */
  items: T[];

  /**
   * Token for retrieving the next page of results.
   * Undefined if this is the last page.
   */
  nextToken?: string;
}
