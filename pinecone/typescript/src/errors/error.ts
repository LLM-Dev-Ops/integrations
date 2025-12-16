/**
 * Base error class for all Pinecone API errors.
 * Provides structured error information including error type, HTTP status,
 * retry capabilities, and optional retry-after information.
 */
export class PineconeError extends Error {
  /**
   * The type of error (e.g., 'invalid_request_error', 'authentication_error')
   */
  public readonly type: string;

  /**
   * HTTP status code associated with the error, if applicable
   */
  public readonly status?: number;

  /**
   * Number of seconds to wait before retrying, if provided by the API
   */
  public readonly retryAfter?: number;

  /**
   * Indicates whether this error type can be retried
   */
  public readonly isRetryable: boolean;

  /**
   * Additional error details from the API response
   */
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    type: string;
    message: string;
    status?: number;
    retryAfter?: number;
    isRetryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'PineconeError';
    this.type = options.type;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.isRetryable = options.isRetryable ?? false;
    this.details = options.details;

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
      type: this.type,
      message: this.message,
      status: this.status,
      retryAfter: this.retryAfter,
      isRetryable: this.isRetryable,
      details: this.details,
    };
  }
}
