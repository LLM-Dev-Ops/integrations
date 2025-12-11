/**
 * Base error class for all Gemini API errors.
 */
export class GeminiError extends Error {
  /** The type/category of error */
  public readonly type: string;

  /** HTTP status code if applicable */
  public readonly status?: number;

  /** Seconds to wait before retrying */
  public readonly retryAfter?: number;

  /** Whether this error can be retried */
  public readonly isRetryable: boolean;

  /** Additional error details */
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
    this.name = 'GeminiError';
    this.type = options.type;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.isRetryable = options.isRetryable ?? false;
    this.details = options.details;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** Returns JSON representation of the error */
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

/**
 * Result type for operations that may fail
 */
export type GeminiResult<T> =
  | { success: true; data: T }
  | { success: false; error: GeminiError };
