/**
 * Base error class for all DynamoDB errors.
 * Provides structured error information including error code, HTTP status,
 * retry capabilities, and original error details.
 */
export class DynamoDBError extends Error {
  /**
   * DynamoDB error code (e.g., 'ProvisionedThroughputExceededException', 'ValidationException')
   */
  public readonly code: string;

  /**
   * HTTP status code associated with the error, if applicable
   */
  public readonly httpStatusCode?: number;

  /**
   * Indicates whether this error type can be retried
   */
  public readonly isRetryable: boolean;

  /**
   * The original error from AWS SDK, if applicable
   */
  public readonly originalError?: Error;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    httpStatusCode?: number;
    isRetryable?: boolean;
    originalError?: Error;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'DynamoDBError';
    this.code = options.code;
    this.httpStatusCode = options.httpStatusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.originalError = options.originalError;
    this.details = options.details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a string representation of the error
   */
  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    if (this.httpStatusCode) {
      result += ` (HTTP ${this.httpStatusCode})`;
    }
    if (this.isRetryable) {
      result += ' [retryable]';
    }
    return result;
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatusCode: this.httpStatusCode,
      isRetryable: this.isRetryable,
      details: this.details,
    };
  }
}
