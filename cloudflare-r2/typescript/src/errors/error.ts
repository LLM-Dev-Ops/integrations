/**
 * Base error class for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/errors/error
 */

/**
 * Parameters for creating an R2Error
 */
export interface R2ErrorParams {
  /**
   * Error type/category
   */
  readonly type: string;

  /**
   * Human-readable error message
   */
  readonly message: string;

  /**
   * HTTP status code (if applicable)
   */
  readonly status?: number;

  /**
   * R2/S3 error code
   */
  readonly code?: string;

  /**
   * Whether this error is retryable
   */
  readonly isRetryable: boolean;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;

  /**
   * Retry-After header value in seconds
   */
  readonly retryAfter?: number;

  /**
   * Additional error details
   */
  readonly details?: Record<string, unknown>;
}

/**
 * Base error class for all R2 operations
 *
 * Provides structured error information including:
 * - Error type/category for programmatic handling
 * - HTTP status codes and R2 error codes
 * - Retry information (isRetryable, retryAfter)
 * - Request IDs for troubleshooting
 * - Structured details for additional context
 */
export class R2Error extends Error {
  /**
   * Error type/category
   */
  readonly type: string;

  /**
   * HTTP status code (if applicable)
   */
  readonly status?: number;

  /**
   * R2/S3 error code
   */
  readonly code?: string;

  /**
   * Whether this error is retryable
   */
  readonly isRetryable: boolean;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;

  /**
   * Retry-After header value in seconds
   */
  readonly retryAfter?: number;

  /**
   * Additional error details
   */
  readonly details?: Record<string, unknown>;

  /**
   * Creates a new R2Error
   * @param params - Error parameters
   */
  constructor(params: R2ErrorParams) {
    super(params.message);

    // Set the prototype explicitly to maintain instanceof checks
    Object.setPrototypeOf(this, R2Error.prototype);

    this.name = 'R2Error';
    this.type = params.type;
    this.status = params.status;
    this.code = params.code;
    this.isRetryable = params.isRetryable;
    this.requestId = params.requestId;
    this.retryAfter = params.retryAfter;
    this.details = params.details;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, R2Error);
    }
  }

  /**
   * Converts the error to a JSON representation
   * @returns JSON object with error details
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      status: this.status,
      code: this.code,
      isRetryable: this.isRetryable,
      requestId: this.requestId,
      retryAfter: this.retryAfter,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Returns a string representation of the error
   */
  toString(): string {
    const parts = [this.name, this.type];

    if (this.code) {
      parts.push(`[${this.code}]`);
    }

    if (this.status) {
      parts.push(`(${this.status})`);
    }

    parts.push(`- ${this.message}`);

    if (this.requestId) {
      parts.push(`(RequestId: ${this.requestId})`);
    }

    return parts.join(' ');
  }
}
