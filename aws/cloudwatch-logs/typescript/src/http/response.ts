/**
 * HTTP response parsing for AWS CloudWatch Logs API.
 *
 * This module provides utilities for parsing CloudWatch Logs API responses,
 * extracting pagination tokens, and handling errors.
 *
 * @module http/response
 */

import type { HttpResponse, AwsErrorResponse } from './types';

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
 * interface PutLogEventsResponse {
 *   nextSequenceToken: string;
 * }
 *
 * const body = '{"nextSequenceToken":"token-123"}';
 * const response = parseResponse<PutLogEventsResponse>(body);
 * console.log('Next token:', response.nextSequenceToken);
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
 * Extract the nextToken from a paginated response.
 *
 * Many CloudWatch Logs API operations return paginated results with a nextToken field.
 * This function safely extracts that token.
 *
 * @param response - Parsed response object
 * @returns Next token if present, undefined otherwise
 *
 * @example
 * ```typescript
 * const response = {
 *   logStreams: [
 *     { logStreamName: 'stream-1' }
 *   ],
 *   nextToken: 'abc123'
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

  // Check for nextToken field
  if (typeof obj['nextToken'] === 'string') {
    return obj['nextToken'];
  }

  return undefined;
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
 *   body: '{"nextSequenceToken":"token-123"}'
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
 *   body: '{"__type":"InvalidParameterException"}'
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
 *     __type: 'InvalidParameterException',
 *     message: 'Invalid log group name'
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

  // Extract error message (check both 'message' and 'Message' fields)
  const message =
    errorResponse?.message ??
    errorResponse?.Message ??
    (response.body || getDefaultErrorMessage(response.status));

  // Determine if error is retryable
  const retryable = isRetryableError(response.status, type);

  // Extract request ID from headers
  const requestId = extractRequestId(response.headers);

  // Extract retry-after header if present (in seconds)
  const retryAfterHeader = response.headers['retry-after'] ?? response.headers['Retry-After'];
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

  return {
    type,
    message,
    retryable,
    requestId,
    statusCode: response.status,
    retryAfter: !isNaN(retryAfter as number) ? retryAfter : undefined,
  };
}

/**
 * Information about an AWS error.
 */
export interface AwsErrorInfo {
  /**
   * Error type (e.g., 'InvalidParameterException', 'ThrottlingException').
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

  /**
   * Retry-after delay in seconds, if specified by the server.
   */
  retryAfter?: number;
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

  // DataAlreadyAcceptedException is retryable (sequence token conflict)
  if (errorType.includes('DataAlreadyAcceptedException')) {
    return true;
  }

  // InvalidSequenceTokenException is retryable (get new token and retry)
  if (errorType.includes('InvalidSequenceTokenException')) {
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
