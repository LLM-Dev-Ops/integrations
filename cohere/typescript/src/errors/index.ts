/**
 * Error types for the Cohere client.
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'configuration'
  | 'authentication'
  | 'validation'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'not_found'
  | 'stream'
  | 'api'
  | 'internal';

/**
 * Validation error detail
 */
export interface ValidationDetail {
  field: string;
  message: string;
  code?: string;
}

/**
 * Base error class for all Cohere errors
 */
export abstract class CohereError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly isRetryable: boolean;
  readonly statusCode?: number;
  readonly retryAfter?: number;

  constructor(
    message: string,
    options?: { statusCode?: number; retryAfter?: number; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.statusCode = options?.statusCode;
    this.retryAfter = options?.retryAfter;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigurationError extends CohereError {
  readonly category = 'configuration' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Authentication error - invalid or missing API key
 */
export class AuthenticationError extends CohereError {
  readonly category = 'authentication' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 401 });
  }
}

/**
 * Validation error - invalid request parameters
 */
export class ValidationError extends CohereError {
  readonly category = 'validation' as const;
  readonly isRetryable = false;
  readonly details: ValidationDetail[];

  constructor(
    message: string,
    details: ValidationDetail[] = [],
    options?: { statusCode?: number; cause?: Error }
  ) {
    super(message, { ...options, statusCode: options?.statusCode ?? 400 });
    this.details = details;
  }
}

/**
 * Rate limit error - too many requests
 */
export class RateLimitError extends CohereError {
  readonly category = 'rate_limit' as const;
  readonly isRetryable = true;

  constructor(
    message: string,
    retryAfter?: number,
    options?: { statusCode?: number; cause?: Error }
  ) {
    super(message, {
      ...options,
      statusCode: options?.statusCode ?? 429,
      retryAfter,
    });
  }
}

/**
 * Network error - connection or transport failure
 */
export class NetworkError extends CohereError {
  readonly category = 'network' as const;
  readonly isRetryable = true;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Server error - 5xx responses
 */
export class ServerError extends CohereError {
  readonly category = 'server' as const;
  readonly isRetryable = true;

  constructor(message: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 500 });
  }
}

/**
 * Not found error - resource doesn't exist
 */
export class NotFoundError extends CohereError {
  readonly category = 'not_found' as const;
  readonly isRetryable = false;
  readonly resource?: string;
  readonly resourceId?: string;

  constructor(
    message: string,
    options?: { resource?: string; resourceId?: string; cause?: Error }
  ) {
    super(message, { statusCode: 404, cause: options?.cause });
    this.resource = options?.resource;
    this.resourceId = options?.resourceId;
  }
}

/**
 * Stream error - SSE stream failure
 */
export class StreamError extends CohereError {
  readonly category = 'stream' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * API error - generic API error response
 */
export class ApiError extends CohereError {
  readonly category = 'api' as const;
  readonly isRetryable: boolean;
  readonly errorCode?: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorCode?: string;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.errorCode = options?.errorCode;
    // Retry on 5xx errors
    this.isRetryable = (options?.statusCode ?? 0) >= 500;
  }
}

/**
 * Internal error - unexpected client error
 */
export class InternalError extends CohereError {
  readonly category = 'internal' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof CohereError) {
    return error.isRetryable;
  }
  // Network errors are generally retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

/**
 * Get retry-after duration from an error
 */
export function getRetryAfter(error: unknown): number | undefined {
  if (error instanceof CohereError) {
    return error.retryAfter;
  }
  return undefined;
}

/**
 * Parse an API error response
 */
export function parseApiError(
  statusCode: number,
  body: unknown,
  headers?: Headers
): CohereError {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : 'Unknown error';

  const errorCode =
    typeof body === 'object' && body !== null && 'code' in body
      ? String((body as { code: unknown }).code)
      : undefined;

  const retryAfter = headers?.get('retry-after')
    ? parseInt(headers.get('retry-after')!, 10)
    : undefined;

  switch (statusCode) {
    case 400:
      return new ValidationError(message, [], { statusCode });
    case 401:
      return new AuthenticationError(message, { statusCode });
    case 403:
      return new AuthenticationError(message, { statusCode });
    case 404:
      return new NotFoundError(message);
    case 429:
      return new RateLimitError(message, retryAfter, { statusCode });
    default:
      if (statusCode >= 500) {
        return new ServerError(message, { statusCode });
      }
      return new ApiError(message, { statusCode, errorCode, retryAfter });
  }
}
