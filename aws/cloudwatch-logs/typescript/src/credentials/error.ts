/**
 * Credential error types and utilities.
 *
 * This module defines error types specific to credential operations,
 * providing detailed error codes for different failure scenarios.
 *
 * @module credentials/error
 */

/**
 * Error codes for credential operations.
 */
export type CredentialErrorCode =
  | 'MISSING'         // Credentials not found
  | 'INVALID'         // Credentials are invalid or malformed
  | 'EXPIRED'         // Credentials have expired
  | 'LOAD_FAILED'     // Failed to load credentials from source
  | 'IMDS_ERROR'      // Instance metadata service error
  | 'PROFILE_ERROR';  // Profile configuration error

/**
 * Error class for credential-related failures.
 *
 * This error provides detailed information about why credential
 * retrieval or validation failed, including a specific error code
 * that can be used for programmatic error handling.
 *
 * @example
 * ```typescript
 * throw new CredentialError(
 *   'AWS_ACCESS_KEY_ID environment variable not set',
 *   'MISSING'
 * );
 * ```
 */
export class CredentialError extends Error {
  /**
   * The name of this error class.
   */
  public override readonly name = 'CredentialError';

  /**
   * Creates a new credential error.
   *
   * @param message - Human-readable error description
   * @param code - Specific error code indicating the type of failure
   */
  constructor(
    message: string,
    public readonly code: CredentialErrorCode
  ) {
    super(message);

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CredentialError);
    }
  }

  /**
   * Returns a string representation of this error.
   *
   * @returns Formatted error string with code and message
   */
  public override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
