/**
 * Base error class for all Datadog APM errors.
 *
 * Provides structured error information with category, retry capabilities,
 * and optional cause tracking.
 */

/**
 * Error category for categorizing Datadog APM-specific errors
 */
export type ErrorCategory =
  | 'configuration'
  | 'connection'
  | 'tracing'
  | 'metric'
  | 'validation'
  | 'timeout'
  | 'internal';

/**
 * Base error class for all Datadog APM errors.
 * Provides structured error information including category,
 * retry capabilities, and optional cause tracking.
 */
export abstract class DatadogAPMError extends Error {
  /**
   * The category of error for classification and handling
   */
  public readonly category: ErrorCategory;

  /**
   * Indicates whether this error type can be retried
   */
  public readonly isRetryable: boolean;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  /**
   * The original error that caused this error, if any
   */
  public readonly cause?: Error;

  constructor(options: {
    category: ErrorCategory;
    message: string;
    isRetryable?: boolean;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'DatadogAPMError';
    this.category = options.category;
    this.isRetryable = options.isRetryable ?? false;
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
      isRetryable: this.isRetryable,
      details: this.details,
      cause: this.cause?.message,
    };
  }

  /**
   * Returns a human-readable string representation of the error
   */
  toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }
    return result;
  }
}

/**
 * Type guard to check if an error is a DatadogAPMError
 */
export function isDatadogAPMError(error: unknown): error is DatadogAPMError {
  return error instanceof DatadogAPMError;
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isDatadogAPMError(error) && error.isRetryable;
}

/**
 * Type guard to check if an error belongs to a specific category
 */
export function isErrorCategory(
  error: unknown,
  category: ErrorCategory
): boolean {
  return isDatadogAPMError(error) && error.category === category;
}
