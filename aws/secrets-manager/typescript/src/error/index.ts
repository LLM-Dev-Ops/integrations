/**
 * AWS Secrets Manager Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 * Provides detailed error types for all Secrets Manager operations
 * with proper categorization and retryability information.
 *
 * @module error
 */

import type { AwsErrorResponse } from '../types/index.js';

/**
 * Secrets Manager error codes.
 * Categorizes errors by their source and type for better error handling.
 */
export type SecretsManagerErrorCode =
  | 'CONFIGURATION'           // Invalid configuration
  | 'CREDENTIAL'              // Credential-related errors
  | 'SIGNING'                 // Request signing errors
  | 'TRANSPORT'               // Network/HTTP transport errors
  | 'TIMEOUT'                 // Request timeout
  | 'RATE_LIMITED'            // Rate limiting/throttling
  | 'SECRET_NOT_FOUND'        // Secret does not exist
  | 'VERSION_NOT_FOUND'       // Version does not exist
  | 'ACCESS_DENIED'           // Access denied
  | 'KMS_ACCESS_DENIED'       // KMS key access denied
  | 'RESOURCE_POLICY_DENIED'  // Resource policy denied access
  | 'ROTATION_IN_PROGRESS'    // Rotation is in progress
  | 'ROTATION_FAILED'         // Rotation failed
  | 'ROTATION_NOT_CONFIGURED' // Rotation not configured
  | 'VALIDATION'              // Request validation error
  | 'INTERNAL_ERROR'          // AWS internal error
  | 'QUOTA_EXCEEDED'          // Service quota exceeded
  | 'INVALID_REQUEST'         // Invalid request parameters
  | 'ENCRYPTION_FAILURE'      // Encryption/decryption failure
  | 'MALFORMED_POLICY'        // Malformed resource policy
  | 'UNKNOWN';                // Unknown error

/**
 * Base Secrets Manager error class.
 *
 * All Secrets Manager errors extend this class. Contains error code, message,
 * retryability information, and optional AWS request ID.
 *
 * @example
 * ```typescript
 * throw new SecretsManagerError(
 *   'Rate limit exceeded',
 *   'RATE_LIMITED',
 *   true,  // retryable
 *   'abc-123-def'
 * );
 * ```
 */
export class SecretsManagerError extends Error {
  /**
   * Error code identifying the error type.
   */
  public readonly code: SecretsManagerErrorCode;

  /**
   * Whether this error is retryable.
   * If true, the operation can be safely retried.
   */
  public readonly retryable: boolean;

  /**
   * AWS request ID for tracking and debugging.
   * Available when the error comes from an AWS API response.
   */
  public readonly requestId?: string;

  /**
   * HTTP status code if error came from HTTP response.
   */
  public readonly statusCode?: number;

  /**
   * Create a new Secrets Manager error.
   *
   * @param message - Human-readable error message
   * @param code - Error code
   * @param retryable - Whether the operation can be retried
   * @param requestId - AWS request ID (optional)
   * @param statusCode - HTTP status code (optional)
   */
  constructor(
    message: string,
    code: SecretsManagerErrorCode,
    retryable: boolean = false,
    requestId?: string,
    statusCode?: number
  ) {
    super(message);
    this.name = 'SecretsManagerError';
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.statusCode = statusCode;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecretsManagerError);
    }

    Object.setPrototypeOf(this, SecretsManagerError.prototype);
  }

  /**
   * Check if an unknown error is retryable.
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof SecretsManagerError) {
      return error.retryable;
    }

    // Network errors are generally retryable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }

    return false;
  }

  /**
   * Get error code from an error.
   *
   * @param error - Error to extract code from
   * @returns Error code or 'UNKNOWN'
   */
  static getCode(error: unknown): SecretsManagerErrorCode {
    if (error instanceof SecretsManagerError) {
      return error.code;
    }
    return 'UNKNOWN';
  }

  /**
   * Get request ID from an error if available.
   *
   * @param error - Error to extract request ID from
   * @returns Request ID or undefined
   */
  static getRequestId(error: unknown): string | undefined {
    if (error instanceof SecretsManagerError) {
      return error.requestId;
    }
    return undefined;
  }

  /**
   * Convert error to a plain object for serialization.
   *
   * @returns Plain object representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      requestId: this.requestId,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Map AWS API error response to Secrets Manager error.
 *
 * Converts AWS error responses into appropriate SecretsManagerError instances
 * with correct error codes and retryability settings.
 *
 * @param response - AWS error response from API
 * @param statusCode - HTTP status code
 * @param requestId - AWS request ID
 * @returns Mapped Secrets Manager error
 */
export function mapAwsError(
  response: AwsErrorResponse,
  statusCode?: number,
  requestId?: string
): SecretsManagerError {
  const errorType = response.__type || 'Unknown';
  const message = response.message || response.Message || errorType;

  // Extract error code from __type (format: "com.amazonaws.secretsmanager#ErrorCode")
  const errorCode = errorType.includes('#') ? errorType.split('#')[1] : errorType;

  // Map AWS error codes to Secrets Manager error codes
  switch (errorCode) {
    // Not found errors
    case 'ResourceNotFoundException':
      if (message.toLowerCase().includes('version')) {
        return new SecretsManagerError(message, 'VERSION_NOT_FOUND', false, requestId, statusCode);
      }
      return new SecretsManagerError(message, 'SECRET_NOT_FOUND', false, requestId, statusCode);

    case 'SecretNotFoundException':
      return new SecretsManagerError(message, 'SECRET_NOT_FOUND', false, requestId, statusCode);

    // Access errors
    case 'AccessDeniedException':
      return new SecretsManagerError(message, 'ACCESS_DENIED', false, requestId, statusCode);

    case 'DecryptionFailureException':
    case 'DecryptionFailure':
      return new SecretsManagerError(message, 'KMS_ACCESS_DENIED', false, requestId, statusCode);

    case 'EncryptionFailure':
      return new SecretsManagerError(message, 'ENCRYPTION_FAILURE', false, requestId, statusCode);

    // Rotation errors
    case 'InvalidRequestException':
      if (message.toLowerCase().includes('rotation')) {
        if (message.toLowerCase().includes('in progress')) {
          return new SecretsManagerError(message, 'ROTATION_IN_PROGRESS', false, requestId, statusCode);
        }
        if (message.toLowerCase().includes('not configured') || message.toLowerCase().includes('no rotation')) {
          return new SecretsManagerError(message, 'ROTATION_NOT_CONFIGURED', false, requestId, statusCode);
        }
        return new SecretsManagerError(message, 'ROTATION_FAILED', false, requestId, statusCode);
      }
      return new SecretsManagerError(message, 'INVALID_REQUEST', false, requestId, statusCode);

    // Rate limiting and throttling
    case 'ThrottlingException':
    case 'Throttling':
    case 'TooManyRequestsException':
      return new SecretsManagerError(message, 'RATE_LIMITED', true, requestId, statusCode);

    // Quota errors
    case 'LimitExceededException':
      return new SecretsManagerError(message, 'QUOTA_EXCEEDED', false, requestId, statusCode);

    // Validation errors
    case 'ValidationException':
    case 'InvalidParameterException':
    case 'InvalidParameterValueException':
    case 'MissingRequiredParameterException':
      return new SecretsManagerError(message, 'VALIDATION', false, requestId, statusCode);

    // Policy errors
    case 'MalformedPolicyDocumentException':
      return new SecretsManagerError(message, 'MALFORMED_POLICY', false, requestId, statusCode);

    case 'ResourceExistsException':
      return new SecretsManagerError(message, 'VALIDATION', false, requestId, statusCode);

    case 'PreconditionNotMetException':
      return new SecretsManagerError(message, 'VALIDATION', false, requestId, statusCode);

    // Service errors (retryable)
    case 'InternalServiceError':
    case 'InternalServiceErrorException':
    case 'ServiceUnavailable':
    case 'InternalFailure':
      return new SecretsManagerError(message, 'INTERNAL_ERROR', true, requestId, statusCode);

    // Default
    default:
      // Determine retryability based on status code
      const retryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
      return new SecretsManagerError(message, 'UNKNOWN', retryable, requestId, statusCode);
  }
}

/**
 * Map HTTP status code to Secrets Manager error.
 *
 * Creates appropriate error for HTTP-level failures.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param requestId - AWS request ID
 * @returns Secrets Manager error
 */
export function mapHttpError(
  statusCode: number,
  body: string,
  requestId?: string
): SecretsManagerError {
  let message = `HTTP ${statusCode}`;

  // Try to parse error from body
  try {
    const parsed = JSON.parse(body) as AwsErrorResponse;
    if (parsed.message || parsed.Message || parsed.__type) {
      return mapAwsError(parsed, statusCode, requestId);
    }
  } catch {
    // Not JSON, use body as message if short enough
    if (body.length < 200) {
      message = body || message;
    }
  }

  // Map by status code
  if (statusCode === 400) {
    return new SecretsManagerError(message, 'VALIDATION', false, requestId, statusCode);
  } else if (statusCode === 401 || statusCode === 403) {
    return new SecretsManagerError(message, 'ACCESS_DENIED', false, requestId, statusCode);
  } else if (statusCode === 404) {
    return new SecretsManagerError(message, 'SECRET_NOT_FOUND', false, requestId, statusCode);
  } else if (statusCode === 429) {
    return new SecretsManagerError(message, 'RATE_LIMITED', true, requestId, statusCode);
  } else if (statusCode >= 500) {
    return new SecretsManagerError(message, 'INTERNAL_ERROR', true, requestId, statusCode);
  }

  return new SecretsManagerError(message, 'UNKNOWN', false, requestId, statusCode);
}

/**
 * Create a configuration error.
 *
 * @param message - Error message
 * @returns Configuration error
 */
export function configurationError(message: string): SecretsManagerError {
  return new SecretsManagerError(message, 'CONFIGURATION', false);
}

/**
 * Create a credential error.
 *
 * @param message - Error message
 * @returns Credential error
 */
export function credentialError(message: string): SecretsManagerError {
  return new SecretsManagerError(message, 'CREDENTIAL', false);
}

/**
 * Create a signing error.
 *
 * @param message - Error message
 * @returns Signing error
 */
export function signingError(message: string): SecretsManagerError {
  return new SecretsManagerError(message, 'SIGNING', false);
}

/**
 * Create a validation error.
 *
 * @param message - Error message
 * @returns Validation error
 */
export function validationError(message: string): SecretsManagerError {
  return new SecretsManagerError(message, 'VALIDATION', false);
}

/**
 * Create a transport error.
 *
 * @param message - Error message
 * @param retryable - Whether the error is retryable
 * @returns Transport error
 */
export function transportError(message: string, retryable: boolean = true): SecretsManagerError {
  return new SecretsManagerError(message, 'TRANSPORT', retryable);
}

/**
 * Create a timeout error.
 *
 * @param message - Error message
 * @returns Timeout error
 */
export function timeoutError(message: string): SecretsManagerError {
  return new SecretsManagerError(message, 'TIMEOUT', true);
}

/**
 * Create a secret not found error.
 *
 * @param secretId - Secret ID that was not found
 * @returns Secret not found error
 */
export function secretNotFoundError(secretId: string): SecretsManagerError {
  return new SecretsManagerError(
    `Secret not found: ${secretId}`,
    'SECRET_NOT_FOUND',
    false
  );
}

/**
 * Create a version not found error.
 *
 * @param secretId - Secret ID
 * @param versionId - Version ID that was not found
 * @returns Version not found error
 */
export function versionNotFoundError(secretId: string, versionId: string): SecretsManagerError {
  return new SecretsManagerError(
    `Version not found: ${versionId} for secret ${secretId}`,
    'VERSION_NOT_FOUND',
    false
  );
}

/**
 * Wrap an unknown error as a Secrets Manager error.
 *
 * @param error - Error to wrap
 * @param defaultCode - Default error code if unknown
 * @returns Secrets Manager error
 */
export function wrapError(
  error: unknown,
  defaultCode: SecretsManagerErrorCode = 'UNKNOWN'
): SecretsManagerError {
  if (error instanceof SecretsManagerError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for network/fetch errors
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return new SecretsManagerError('Request aborted', 'TIMEOUT', true);
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new SecretsManagerError(`Network error: ${error.message}`, 'TRANSPORT', true);
    }

    return new SecretsManagerError(error.message, defaultCode, false);
  }

  return new SecretsManagerError(String(error), defaultCode, false);
}
