/**
 * AWS Signing Error Types
 *
 * Error types for AWS request signing operations.
 */

/**
 * Error codes for signing operations.
 */
export type SigningErrorCode =
  | 'MISSING_HEADER'
  | 'INVALID_URL'
  | 'INVALID_TIMESTAMP'
  | 'SIGNING_FAILED';

/**
 * Error thrown during request signing operations.
 *
 * @example
 * ```typescript
 * throw new SigningError('Missing required header: host', 'MISSING_HEADER');
 * ```
 */
export class SigningError extends Error {
  /**
   * Error code indicating the type of signing failure.
   */
  public readonly code: SigningErrorCode;

  /**
   * Creates a new SigningError.
   *
   * @param message - Human-readable error message
   * @param code - Error code indicating the type of failure
   */
  constructor(message: string, code: SigningErrorCode) {
    super(message);
    this.name = 'SigningError';
    this.code = code;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SigningError);
    }

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, SigningError.prototype);
  }

  /**
   * Returns a string representation of the error.
   */
  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/**
 * Type guard to check if an error is a SigningError.
 */
export function isSigningError(error: unknown): error is SigningError {
  return error instanceof SigningError;
}
