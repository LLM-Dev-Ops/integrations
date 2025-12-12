/**
 * AWS SES Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 * Provides detailed error types for all SES operations with proper
 * categorization and retryability information.
 *
 * @module error
 */

import { AwsErrorResponse } from "../http/types";

/**
 * SES error codes.
 *
 * Categorizes errors by their source and type for better error handling.
 */
export type SesErrorCode =
  | "CONFIGURATION" // Invalid configuration
  | "CREDENTIAL" // Credential-related errors
  | "SIGNING" // Request signing errors
  | "TRANSPORT" // Network/HTTP transport errors
  | "TIMEOUT" // Request timeout
  | "RATE_LIMITED" // Rate limiting/throttling
  | "ACCOUNT_SUSPENDED" // Account suspended
  | "SENDING_PAUSED" // Sending paused
  | "QUOTA_EXCEEDED" // Sending quota exceeded
  | "IDENTITY_NOT_VERIFIED" // Email/domain not verified
  | "TEMPLATE_NOT_FOUND" // Template doesn't exist
  | "VALIDATION" // Request validation error
  | "AWS_API" // AWS API error
  | "UNKNOWN"; // Unknown error

/**
 * Base SES error class.
 *
 * All SES errors extend this class. Contains error code, message,
 * retryability information, and optional AWS request ID.
 *
 * @example
 * ```typescript
 * throw new SesError(
 *   'Rate limit exceeded',
 *   'RATE_LIMITED',
 *   true,  // retryable
 *   'abc-123-def'
 * );
 * ```
 */
export class SesError extends Error {
  /**
   * Error code identifying the error type.
   */
  public readonly code: SesErrorCode;

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
   * Create a new SES error.
   *
   * @param message - Human-readable error message
   * @param code - Error code
   * @param retryable - Whether the operation can be retried
   * @param requestId - AWS request ID (optional)
   * @param statusCode - HTTP status code (optional)
   */
  constructor(
    message: string,
    code: SesErrorCode,
    retryable: boolean = false,
    requestId?: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "SesError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.statusCode = statusCode;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SesError);
    }

    Object.setPrototypeOf(this, SesError.prototype);
  }

  /**
   * Check if an unknown error is retryable.
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof SesError) {
      return error.retryable;
    }

    // Network errors are generally retryable
    if (error instanceof TypeError && error.message.includes("fetch")) {
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
  static getCode(error: unknown): SesErrorCode {
    if (error instanceof SesError) {
      return error.code;
    }
    return "UNKNOWN";
  }

  /**
   * Get request ID from an error if available.
   *
   * @param error - Error to extract request ID from
   * @returns Request ID or undefined
   */
  static getRequestId(error: unknown): string | undefined {
    if (error instanceof SesError) {
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
 * Map AWS API error response to SES error.
 *
 * Converts AWS error responses into appropriate SesError instances
 * with correct error codes and retryability settings.
 *
 * @param response - AWS error response from API
 * @param statusCode - HTTP status code
 * @param requestId - AWS request ID
 * @returns Mapped SES error
 *
 * @example
 * ```typescript
 * const error = mapAwsError(
 *   { __type: 'MessageRejected', message: 'Email address not verified' },
 *   400,
 *   'req-123'
 * );
 * // Returns SesError with code 'IDENTITY_NOT_VERIFIED'
 * ```
 */
export function mapAwsError(
  response: AwsErrorResponse,
  statusCode?: number,
  requestId?: string
): SesError {
  const errorType = response.__type || "Unknown";
  const message = response.message || errorType;

  // Extract error code from __type (format: "com.amazonaws.ses#ErrorCode")
  const errorCode = errorType.includes("#") ? errorType.split("#")[1] : errorType;

  // Map AWS error codes to SES error codes
  switch (errorCode) {
    // Identity/verification errors
    case "MessageRejected":
      if (message.toLowerCase().includes("not verified")) {
        return new SesError(message, "IDENTITY_NOT_VERIFIED", false, requestId, statusCode);
      }
      return new SesError(message, "VALIDATION", false, requestId, statusCode);

    case "MailFromDomainNotVerifiedException":
    case "FromEmailAddressNotVerifiedException":
      return new SesError(message, "IDENTITY_NOT_VERIFIED", false, requestId, statusCode);

    // Template errors
    case "TemplateDoesNotExist":
    case "TemplateDoesNotExistException":
      return new SesError(message, "TEMPLATE_NOT_FOUND", false, requestId, statusCode);

    case "InvalidTemplateException":
    case "InvalidRenderingParameterException":
      return new SesError(message, "VALIDATION", false, requestId, statusCode);

    // Rate limiting and throttling
    case "Throttling":
    case "ThrottlingException":
    case "TooManyRequestsException":
      return new SesError(message, "RATE_LIMITED", true, requestId, statusCode);

    // Quota errors
    case "SendingPausedException":
      return new SesError(message, "SENDING_PAUSED", false, requestId, statusCode);

    case "AccountSuspendedException":
      return new SesError(message, "ACCOUNT_SUSPENDED", false, requestId, statusCode);

    case "DailyQuotaExceededException":
    case "MaximumSendingRateExceededException":
      return new SesError(message, "QUOTA_EXCEEDED", true, requestId, statusCode);

    // Validation errors
    case "ValidationException":
    case "InvalidParameterValue":
    case "InvalidParameterException":
    case "MissingRequiredParameter":
      return new SesError(message, "VALIDATION", false, requestId, statusCode);

    // Configuration errors
    case "ConfigurationSetDoesNotExistException":
    case "ConfigurationSetSendingPausedException":
      return new SesError(message, "VALIDATION", false, requestId, statusCode);

    // Service errors (retryable)
    case "InternalServiceErrorException":
    case "ServiceUnavailable":
    case "InternalFailure":
      return new SesError(message, "AWS_API", true, requestId, statusCode);

    // Timeout
    case "RequestTimeout":
    case "RequestTimeoutException":
      return new SesError(message, "TIMEOUT", true, requestId, statusCode);

    // Default
    default:
      // Determine retryability based on status code
      const retryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
      return new SesError(message, "AWS_API", retryable, requestId, statusCode);
  }
}

/**
 * Map HTTP status code to SES error.
 *
 * Creates appropriate error for HTTP-level failures.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param requestId - AWS request ID
 * @returns SES error
 */
export function mapHttpError(statusCode: number, body: string, requestId?: string): SesError {
  let message = `HTTP ${statusCode}`;

  // Try to parse error from body
  try {
    const parsed = JSON.parse(body) as AwsErrorResponse;
    if (parsed.message || parsed.__type) {
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
    return new SesError(message, "VALIDATION", false, requestId, statusCode);
  } else if (statusCode === 401 || statusCode === 403) {
    return new SesError(message, "CREDENTIAL", false, requestId, statusCode);
  } else if (statusCode === 429) {
    return new SesError(message, "RATE_LIMITED", true, requestId, statusCode);
  } else if (statusCode >= 500) {
    return new SesError(message, "AWS_API", true, requestId, statusCode);
  }

  return new SesError(message, "AWS_API", false, requestId, statusCode);
}

/**
 * Create a configuration error.
 *
 * @param message - Error message
 * @returns Configuration error
 */
export function configurationError(message: string): SesError {
  return new SesError(message, "CONFIGURATION", false);
}

/**
 * Create a credential error.
 *
 * @param message - Error message
 * @returns Credential error
 */
export function credentialError(message: string): SesError {
  return new SesError(message, "CREDENTIAL", false);
}

/**
 * Create a signing error.
 *
 * @param message - Error message
 * @returns Signing error
 */
export function signingError(message: string): SesError {
  return new SesError(message, "SIGNING", false);
}

/**
 * Create a validation error.
 *
 * @param message - Error message
 * @returns Validation error
 */
export function validationError(message: string): SesError {
  return new SesError(message, "VALIDATION", false);
}

/**
 * Create a transport error.
 *
 * @param message - Error message
 * @param retryable - Whether the error is retryable
 * @returns Transport error
 */
export function transportError(message: string, retryable: boolean = true): SesError {
  return new SesError(message, "TRANSPORT", retryable);
}

/**
 * Create a timeout error.
 *
 * @param message - Error message
 * @returns Timeout error
 */
export function timeoutError(message: string): SesError {
  return new SesError(message, "TIMEOUT", true);
}

/**
 * Wrap an unknown error as a SES error.
 *
 * @param error - Error to wrap
 * @param defaultCode - Default error code if unknown
 * @returns SES error
 */
export function wrapError(error: unknown, defaultCode: SesErrorCode = "UNKNOWN"): SesError {
  if (error instanceof SesError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for network/fetch errors
    if (error.name === "AbortError" || error.message.includes("aborted")) {
      return new SesError("Request aborted", "TIMEOUT", true);
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return new SesError(`Network error: ${error.message}`, "TRANSPORT", true);
    }

    return new SesError(error.message, defaultCode, false);
  }

  return new SesError(String(error), defaultCode, false);
}
