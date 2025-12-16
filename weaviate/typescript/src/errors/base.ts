/**
 * Error category for categorizing Weaviate-specific errors
 */
export type ErrorCategory =
  | 'configuration'
  | 'authentication'
  | 'validation'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'not_found'
  | 'batch'
  | 'graphql'
  | 'tenant'
  | 'schema'
  | 'internal';

/**
 * Base error class for all Weaviate API errors.
 * Provides structured error information including category, HTTP status,
 * retry capabilities, and optional retry-after information.
 */
export abstract class WeaviateError extends Error {
  /**
   * The category of error for classification and handling
   */
  public readonly category: ErrorCategory;

  /**
   * HTTP status code associated with the error, if applicable
   */
  public readonly statusCode?: number;

  /**
   * Indicates whether this error type can be retried
   */
  public readonly isRetryable: boolean;

  /**
   * Number of seconds to wait before retrying, if provided by the API
   */
  public readonly retryAfter?: number;

  /**
   * Additional error details from the API response
   */
  public readonly details?: Record<string, unknown>;

  /**
   * The original error that caused this error, if any
   */
  public readonly cause?: Error;

  constructor(options: {
    category: ErrorCategory;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    retryAfter?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'WeaviateError';
    this.category = options.category;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
    this.cause = options.cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      message: this.message,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      retryAfter: this.retryAfter,
      details: this.details,
      cause: this.cause?.message,
    };
  }

  /**
   * Returns a human-readable string representation of the error
   */
  toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (this.statusCode) {
      result += ` (HTTP ${this.statusCode})`;
    }
    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }
    return result;
  }
}

/**
 * Type guard to check if an error is a WeaviateError
 */
export function isWeaviateError(error: unknown): error is WeaviateError {
  return error instanceof WeaviateError;
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isWeaviateError(error) && error.isRetryable;
}

/**
 * Type guard to check if an error belongs to a specific category
 */
export function isErrorCategory(
  error: unknown,
  category: ErrorCategory
): boolean {
  return isWeaviateError(error) && error.category === category;
}

/**
 * Extract retry-after value from error
 */
export function getRetryAfter(error: unknown): number | undefined {
  return isWeaviateError(error) ? error.retryAfter : undefined;
}
