/**
 * HTTP types for AWS CloudWatch Logs API communication.
 *
 * This module provides type definitions for HTTP requests and responses,
 * including client configuration options.
 *
 * @module http/types
 */

/**
 * HTTP methods supported by the CloudWatch Logs API.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

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
 *   path: '/',
 *   headers: {
 *     'Content-Type': 'application/x-amz-json-1.1',
 *     'X-Amz-Target': 'Logs_20140328.PutLogEvents'
 *   },
 *   body: JSON.stringify({ /* log events data *\/ })
 * };
 * ```
 */
export interface HttpRequest {
  /**
   * HTTP method (typically POST for CloudWatch Logs).
   */
  method: HttpMethod;

  /**
   * Request path (typically "/" for CloudWatch Logs JSON-RPC API).
   */
  path: string;

  /**
   * HTTP headers as key-value pairs.
   * Header names are case-insensitive but typically lowercase.
   */
  headers: Record<string, string>;

  /**
   * Request body as a string.
   * Typically JSON for CloudWatch Logs API calls.
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
 *     'content-type': 'application/x-amz-json-1.1',
 *     'x-amzn-requestid': 'abc-123'
 *   },
 *   body: '{"nextSequenceToken":"token-456"}'
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
 * AWS error response structure.
 *
 * Represents the JSON structure of AWS API error responses.
 *
 * @internal
 */
export interface AwsErrorResponse {
  /**
   * Error type (e.g., "InvalidParameterException", "ThrottlingException").
   */
  __type?: string;

  /**
   * Human-readable error message.
   */
  message?: string;

  /**
   * Alternative message field (some AWS services use this).
   */
  Message?: string;

  /**
   * Additional error details.
   */
  [key: string]: unknown;
}

/**
 * HTTP client configuration options.
 *
 * Controls timeout behavior and retry settings for HTTP requests.
 *
 * @example
 * ```typescript
 * const config: HttpClientConfig = {
 *   timeout: 30000,           // 30 second request timeout
 *   connectTimeout: 10000,    // 10 second connection timeout
 *   maxRetries: 3,            // Retry up to 3 times
 *   retryDelayMs: 1000        // Start with 1 second delay
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
   * Maximum number of retry attempts for failed requests.
   *
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in milliseconds.
   * Delay is doubled with each retry (exponential backoff).
   *
   * @default 1000 (1 second)
   */
  retryDelayMs?: number;
}

/**
 * Retry configuration for the HTTP client.
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts.
   */
  maxRetries: number;

  /**
   * Initial delay between retries in milliseconds.
   */
  initialDelayMs: number;

  /**
   * Maximum delay between retries in milliseconds.
   */
  maxDelayMs: number;

  /**
   * Backoff multiplier for exponential backoff.
   */
  backoffMultiplier: number;
}
