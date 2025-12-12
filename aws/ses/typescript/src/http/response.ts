/**
 * HTTP response parsing for AWS SES API.
 *
 * This module provides utilities for parsing AWS SES API responses,
 * extracting pagination tokens, and handling errors.
 *
 * @module http/response
 */

import type { HttpResponse, PaginatedResponse, AwsErrorResponse } from './types.js';

/**
 * Parse a JSON response body.
 *
 * This is a type-safe wrapper around JSON.parse that provides
 * better error messages for invalid JSON.
 *
 * @template T - The expected response type
 * @param body - Response body as a string
 * @returns Parsed JSON object
 * @throws Error if JSON parsing fails
 *
 * @example
 * ```typescript
 * interface SendEmailResponse {
 *   MessageId: string;
 * }
 *
 * const body = '{"MessageId":"msg-123"}';
 * const response = parseResponse<SendEmailResponse>(body);
 * console.log('Message ID:', response.MessageId);
 * ```
 */
export function parseResponse<T>(body: string): T {
  if (!body || body.trim() === '') {
    throw new Error('Response body is empty');
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract the NextToken from a paginated response.
 *
 * Many AWS SES API operations return paginated results with a NextToken
 * field. This function safely extracts that token.
 *
 * @param response - Parsed response object
 * @returns Next token if present, undefined otherwise
 *
 * @example
 * ```typescript
 * const response = {
 *   Identities: [
 *     { IdentityName: 'example.com', IdentityType: 'DOMAIN' }
 *   ],
 *   NextToken: 'abc123'
 * };
 *
 * const nextToken = extractNextToken(response);
 * console.log('Next token:', nextToken); // 'abc123'
 * ```
 */
export function extractNextToken(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }

  const obj = response as Record<string, unknown>;

  // Check for NextToken field (AWS SES v2 API convention)
  if (typeof obj['NextToken'] === 'string') {
    return obj['NextToken'];
  }

  // Check for nextToken field (alternative convention)
  if (typeof obj['nextToken'] === 'string') {
    return obj['nextToken'];
  }

  return undefined;
}

/**
 * Parse a paginated response.
 *
 * This function parses a response that contains both items and a pagination token.
 *
 * @template T - The type of items in the response
 * @param body - Response body as a string
 * @param itemsKey - The key containing the items array (default: 'Items')
 * @returns Paginated response with items and optional next token
 * @throws Error if parsing fails or items key is not found
 *
 * @example
 * ```typescript
 * interface Identity {
 *   IdentityName: string;
 *   IdentityType: string;
 * }
 *
 * const body = JSON.stringify({
 *   Identities: [
 *     { IdentityName: 'example.com', IdentityType: 'DOMAIN' }
 *   ],
 *   NextToken: 'abc123'
 * });
 *
 * const result = parsePaginatedResponse<Identity>(body, 'Identities');
 * console.log('Items:', result.items);
 * console.log('Next token:', result.nextToken);
 * ```
 */
export function parsePaginatedResponse<T>(
  body: string,
  itemsKey = 'Items'
): PaginatedResponse<T> {
  const parsed = parseResponse<Record<string, unknown>>(body);

  // Extract items array
  const items = parsed[itemsKey];
  if (!Array.isArray(items)) {
    throw new Error(`Response does not contain a valid '${itemsKey}' array`);
  }

  // Extract next token
  const nextToken = extractNextToken(parsed);

  return {
    items: items as T[],
    nextToken,
  };
}

/**
 * Check if an HTTP response indicates success.
 *
 * @param response - HTTP response
 * @returns true if status is in 2xx range
 *
 * @example
 * ```typescript
 * const response: HttpResponse = {
 *   status: 200,
 *   headers: {},
 *   body: '{"success":true}'
 * };
 *
 * if (isSuccessResponse(response)) {
 *   console.log('Request succeeded');
 * }
 * ```
 */
export function isSuccessResponse(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Check if an HTTP response indicates an error.
 *
 * @param response - HTTP response
 * @returns true if status is 4xx or 5xx
 *
 * @example
 * ```typescript
 * const response: HttpResponse = {
 *   status: 400,
 *   headers: {},
 *   body: '{"__type":"ValidationException"}'
 * };
 *
 * if (isErrorResponse(response)) {
 *   console.error('Request failed');
 * }
 * ```
 */
export function isErrorResponse(response: HttpResponse): boolean {
  return response.status >= 400;
}

/**
 * Parse an AWS error response.
 *
 * AWS returns errors in a specific JSON format. This function extracts
 * the error type and message from the response.
 *
 * @param response - HTTP response
 * @returns Parsed error information
 *
 * @example
 * ```typescript
 * const response: HttpResponse = {
 *   status: 400,
 *   headers: {},
 *   body: JSON.stringify({
 *     __type: 'MessageRejected',
 *     message: 'Email address is not verified'
 *   })
 * };
 *
 * const error = parseAwsError(response);
 * console.log('Error type:', error.type);
 * console.log('Error message:', error.message);
 * console.log('Is retryable:', error.retryable);
 * ```
 */
export function parseAwsError(response: HttpResponse): AwsErrorInfo {
  let errorResponse: AwsErrorResponse | undefined;

  // Try to parse error response as JSON
  if (response.body) {
    try {
      errorResponse = parseResponse<AwsErrorResponse>(response.body);
    } catch {
      // Not JSON, will use fallback
    }
  }

  // Extract error type
  const type = errorResponse?.__type ?? `HTTP${response.status}`;

  // Extract error message
  const message =
    errorResponse?.message ??
    (response.body || getDefaultErrorMessage(response.status));

  // Determine if error is retryable
  const retryable = isRetryableError(response.status, type);

  // Extract request ID from headers
  const requestId = extractRequestId(response.headers);

  return {
    type,
    message,
    retryable,
    requestId,
    statusCode: response.status,
  };
}

/**
 * Information about an AWS error.
 */
export interface AwsErrorInfo {
  /**
   * Error type (e.g., 'MessageRejected', 'Throttling').
   */
  type: string;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Whether the error is retryable.
   */
  retryable: boolean;

  /**
   * AWS request ID for debugging.
   */
  requestId?: string;

  /**
   * HTTP status code.
   */
  statusCode: number;
}

/**
 * Extract the AWS request ID from response headers.
 *
 * @param headers - Response headers
 * @returns Request ID if present
 *
 * @internal
 */
function extractRequestId(headers: Record<string, string>): string | undefined {
  // AWS uses various header names for request ID
  return (
    headers['x-amzn-requestid'] ??
    headers['x-amzn-request-id'] ??
    headers['x-amz-request-id'] ??
    undefined
  );
}

/**
 * Determine if an error is retryable based on status code and error type.
 *
 * @param statusCode - HTTP status code
 * @param errorType - AWS error type
 * @returns true if the error should be retried
 *
 * @internal
 */
function isRetryableError(statusCode: number, errorType: string): boolean {
  // 5xx errors are generally retryable (server errors)
  if (statusCode >= 500) {
    return true;
  }

  // 429 (rate limiting) is retryable
  if (statusCode === 429) {
    return true;
  }

  // Throttling errors are retryable
  if (errorType.toLowerCase().includes('throttl')) {
    return true;
  }

  // Service unavailable errors are retryable
  if (errorType.toLowerCase().includes('serviceunavailable')) {
    return true;
  }

  // Request timeout errors are retryable
  if (errorType.toLowerCase().includes('requesttimeout')) {
    return true;
  }

  // 4xx errors are generally not retryable (client errors)
  return false;
}

/**
 * Get a default error message for a status code.
 *
 * @param statusCode - HTTP status code
 * @returns Default error message
 *
 * @internal
 */
function getDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return `HTTP Error ${statusCode}`;
  }
}

/**
 * Extract metadata from response headers.
 *
 * This includes information like request ID, rate limits, etc.
 *
 * @param headers - Response headers
 * @returns Response metadata
 *
 * @example
 * ```typescript
 * const headers = {
 *   'x-amzn-requestid': 'abc-123',
 *   'x-amzn-ratelimit-limit': '100',
 *   'x-amzn-ratelimit-remaining': '95'
 * };
 *
 * const metadata = extractResponseMetadata(headers);
 * console.log('Request ID:', metadata.requestId);
 * console.log('Rate limit:', metadata.rateLimit);
 * ```
 */
export function extractResponseMetadata(headers: Record<string, string>): ResponseMetadata {
  return {
    requestId: extractRequestId(headers),
    rateLimit: headers['x-amzn-ratelimit-limit']
      ? parseInt(headers['x-amzn-ratelimit-limit'], 10)
      : undefined,
    rateLimitRemaining: headers['x-amzn-ratelimit-remaining']
      ? parseInt(headers['x-amzn-ratelimit-remaining'], 10)
      : undefined,
    retryAfter: headers['retry-after']
      ? parseInt(headers['retry-after'], 10)
      : undefined,
  };
}

/**
 * Metadata extracted from response headers.
 */
export interface ResponseMetadata {
  /**
   * AWS request ID for debugging.
   */
  requestId?: string;

  /**
   * Rate limit for this endpoint.
   */
  rateLimit?: number;

  /**
   * Remaining requests before rate limit.
   */
  rateLimitRemaining?: number;

  /**
   * Seconds to wait before retrying (for 429 responses).
   */
  retryAfter?: number;
}
