import { WeaviateError } from './base.js';
import {
  AuthenticationError,
  ForbiddenError,
  ObjectNotFoundError,
  ClassNotFoundError,
  TenantNotFoundError,
  InvalidObjectError,
  InvalidFilterError,
  InvalidVectorError,
  RateLimitedError,
  ServiceUnavailableError,
  InternalError,
  TimeoutError,
  ConnectionError,
  BatchPartialFailureError,
  GraphQLError,
  TenantNotActiveError,
  type BatchErrorDetail,
  type GraphQLErrorDetail,
} from './types.js';

/**
 * HTTP response structure for error mapping
 */
export interface HttpErrorResponse {
  status: number;
  statusText?: string;
  data?: {
    error?: string | { message?: string };
    message?: string;
    errors?: Array<{
      message: string;
      path?: (string | number)[];
      locations?: Array<{ line: number; column: number }>;
      extensions?: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  };
  headers?: Record<string, string>;
}

/**
 * Parse retry-after header value
 */
function parseRetryAfter(retryAfterHeader?: string): number | undefined {
  if (!retryAfterHeader) {
    return undefined;
  }

  // Try parsing as number (seconds)
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfterHeader);
  if (!isNaN(date.getTime())) {
    return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  }

  return undefined;
}

/**
 * Extract error message from response data
 */
function extractErrorMessage(data?: HttpErrorResponse['data']): string {
  if (!data) {
    return 'Unknown error';
  }

  // Try data.message first
  if (typeof data.message === 'string') {
    return data.message;
  }

  // Try data.error (can be string or object with message)
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (typeof data.error === 'object' && data.error?.message) {
    return data.error.message;
  }

  // Try errors array
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors[0].message ?? 'Unknown error';
  }

  return 'Unknown error';
}

/**
 * Map HTTP response to appropriate WeaviateError
 */
export function mapHttpError(response: HttpErrorResponse): WeaviateError {
  const status = response.status;
  const message = extractErrorMessage(response.data);
  const retryAfter = parseRetryAfter(response.headers?.['retry-after']);
  const details = response.data;

  // Handle specific status codes
  switch (status) {
    case 401:
      return new AuthenticationError(message, details);

    case 403:
      return new ForbiddenError(message, details);

    case 404:
      return mapNotFoundError(message, details);

    case 422:
      return mapValidationError(message, details);

    case 429:
      return new RateLimitedError(
        message || 'Rate limit exceeded',
        retryAfter,
        details
      );

    case 503:
      return new ServiceUnavailableError(
        message || 'Service temporarily unavailable',
        retryAfter,
        details
      );

    case 207:
      return mapBatchError(details);

    // 5xx errors
    case 500:
    case 502:
    case 504:
      return new InternalError(
        message || 'Internal server error',
        status,
        details
      );

    default:
      // For unhandled status codes, use InternalError for 5xx, otherwise ValidationError
      if (status >= 500) {
        return new InternalError(
          message || 'Server error',
          status,
          details
        );
      }
      return new InvalidObjectError(
        message || 'Request validation failed',
        details
      );
  }
}

/**
 * Map 404 errors to specific not found error types
 */
function mapNotFoundError(
  message: string,
  details?: Record<string, unknown>
): WeaviateError {
  // Try to determine what wasn't found from the message
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('class') &&
    (lowerMessage.includes('not found') || lowerMessage.includes('does not exist'))
  ) {
    // Extract class name from message if possible
    const classMatch = message.match(/class\s+'?([^'\s]+)'?/i);
    const className = classMatch?.[1] ?? 'Unknown';
    return new ClassNotFoundError(className, details);
  }

  if (
    lowerMessage.includes('tenant') &&
    (lowerMessage.includes('not found') || lowerMessage.includes('does not exist'))
  ) {
    // Extract tenant name from message if possible
    const tenantMatch = message.match(/tenant\s+'?([^'\s]+)'?/i);
    const tenantName = tenantMatch?.[1] ?? 'Unknown';
    return new TenantNotFoundError(tenantName, undefined, details);
  }

  // Default to object not found
  const idMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const objectId = idMatch?.[0] ?? 'Unknown';
  return new ObjectNotFoundError(objectId, undefined, details);
}

/**
 * Map 422 validation errors to specific validation error types
 */
function mapValidationError(
  message: string,
  details?: Record<string, unknown>
): WeaviateError {
  const lowerMessage = message.toLowerCase();

  // Check for tenant not active
  if (
    lowerMessage.includes('tenant') &&
    (lowerMessage.includes('not active') ||
      lowerMessage.includes('inactive') ||
      lowerMessage.includes('offloaded'))
  ) {
    const tenantMatch = message.match(/tenant\s+'?([^'\s]+)'?/i);
    const tenantName = tenantMatch?.[1] ?? 'Unknown';
    const statusMatch = message.match(/status:\s*(\w+)/i);
    const status = statusMatch?.[1] ?? 'inactive';
    return new TenantNotActiveError(tenantName, status, undefined, details);
  }

  // Check for vector-related errors
  if (
    lowerMessage.includes('vector') &&
    (lowerMessage.includes('dimension') ||
      lowerMessage.includes('length') ||
      lowerMessage.includes('invalid'))
  ) {
    return new InvalidVectorError(message, details);
  }

  // Check for filter-related errors
  if (
    lowerMessage.includes('filter') ||
    lowerMessage.includes('where') ||
    lowerMessage.includes('operator')
  ) {
    return new InvalidFilterError(message, details);
  }

  // Default to object validation error
  return new InvalidObjectError(message, details);
}

/**
 * Map batch response with partial failures
 */
function mapBatchError(details?: Record<string, unknown>): WeaviateError {
  const successful = (details?.successful as number) ?? 0;
  const failed = (details?.failed as number) ?? 0;
  const errorsArray = (details?.errors as any[]) ?? [];

  const batchErrors: BatchErrorDetail[] = errorsArray.map((err, idx) => ({
    index: err.index ?? idx,
    objectId: err.objectId,
    message: err.message ?? err.error ?? 'Unknown error',
    details: err.details,
  }));

  return new BatchPartialFailureError(successful, failed, batchErrors, details);
}

/**
 * Map GraphQL errors to GraphQLError
 */
export function mapGraphQLErrors(
  errors: GraphQLErrorDetail[],
  details?: Record<string, unknown>
): GraphQLError {
  return new GraphQLError(errors, details);
}

/**
 * Map network/connection errors to appropriate error types
 */
export function mapNetworkError(error: Error): WeaviateError {
  const message = error.message.toLowerCase();

  // Check for timeout
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline')
  ) {
    return new TimeoutError(error.message, { originalError: error.name });
  }

  // Connection-related errors
  if (
    message.includes('connect') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('socket')
  ) {
    return new ConnectionError(error.message, error);
  }

  // Default to generic connection error
  return new ConnectionError(`Network error: ${error.message}`, error);
}

/**
 * Safe error mapper that handles all error types
 * This is the main entry point for error mapping
 */
export function mapToWeaviateError(error: unknown): WeaviateError {
  // Already a WeaviateError
  if (error instanceof WeaviateError) {
    return error;
  }

  // HTTP response error
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return mapHttpError(error as HttpErrorResponse);
  }

  // Native Error
  if (error instanceof Error) {
    return mapNetworkError(error);
  }

  // Unknown error type
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'An unknown error occurred';

  return new InternalError(message);
}

/**
 * Extract GraphQL errors from a response
 */
export function extractGraphQLErrors(
  response: unknown
): GraphQLErrorDetail[] | null {
  if (
    !response ||
    typeof response !== 'object' ||
    !('errors' in response) ||
    !Array.isArray(response.errors)
  ) {
    return null;
  }

  return response.errors.map((err: any) => ({
    message: err.message ?? 'Unknown GraphQL error',
    path: err.path,
    locations: err.locations,
    extensions: err.extensions,
  }));
}

/**
 * Helper to create appropriate error from GraphQL response
 */
export function handleGraphQLResponse(response: {
  data?: unknown;
  errors?: unknown;
}): void {
  const errors = extractGraphQLErrors(response);
  if (errors && errors.length > 0) {
    throw mapGraphQLErrors(errors);
  }
}

/**
 * Parse API error from HTTP response
 * Convenience wrapper around mapHttpError for fetch-style responses
 *
 * @param status - HTTP status code
 * @param body - Response body (already parsed)
 * @param headers - Response headers
 * @returns Appropriate WeaviateError
 */
export function parseApiError(
  status: number,
  body: unknown,
  headers: Headers
): WeaviateError {
  // Convert Headers to record
  const headersRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headersRecord[key.toLowerCase()] = value;
  });

  // Build HttpErrorResponse structure
  const errorResponse: HttpErrorResponse = {
    status,
    data: typeof body === 'object' && body !== null ? (body as any) : { message: String(body) },
    headers: headersRecord,
  };

  return mapHttpError(errorResponse);
}
