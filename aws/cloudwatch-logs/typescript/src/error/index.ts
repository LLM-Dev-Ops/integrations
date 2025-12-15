/**
 * AWS CloudWatch Logs Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 * Provides detailed error types for all CloudWatch Logs operations with proper
 * categorization and retryability information.
 *
 * @module error
 */

/**
 * AWS error response structure.
 *
 * Represents the JSON structure of AWS API error responses.
 *
 * @internal
 */
export interface AwsErrorResponse {
  /**
   * Error type (e.g., "ResourceNotFoundException", "ThrottlingException").
   */
  __type?: string;

  /**
   * Human-readable error message.
   */
  message?: string;

  /**
   * Additional error details.
   */
  [key: string]: unknown;
}

/**
 * CloudWatch Logs error codes.
 *
 * Categorizes errors by their source and type for better error handling.
 */
export type CloudWatchLogsErrorCode =
  | "CONFIGURATION" // Invalid configuration
  | "CREDENTIAL" // Credential-related errors
  | "SIGNING" // Request signing errors
  | "TRANSPORT" // Network/HTTP transport errors
  | "TIMEOUT" // Request timeout
  | "RATE_LIMITED" // ThrottlingException, TooManyRequests
  | "RESOURCE_NOT_FOUND" // LogGroupNotFound, LogStreamNotFound
  | "RESOURCE_EXISTS" // ResourceAlreadyExistsException
  | "LIMIT_EXCEEDED" // LimitExceededException
  | "VALIDATION" // InvalidParameterException
  | "INVALID_SEQUENCE_TOKEN" // InvalidSequenceTokenException
  | "DATA_ALREADY_ACCEPTED" // DataAlreadyAcceptedException
  | "QUERY_ERROR" // MalformedQuery, QueryFailed, QueryTimeout
  | "SERVER_ERROR" // InternalServerError, ServiceUnavailable
  | "AWS_API" // Generic AWS API error
  | "UNKNOWN"; // Unknown error

/**
 * Base CloudWatch Logs error class.
 *
 * All CloudWatch Logs errors extend this class. Contains error code, message,
 * retryability information, and optional AWS request ID.
 *
 * @example
 * ```typescript
 * throw new CloudWatchLogsError(
 *   'Rate limit exceeded',
 *   'RATE_LIMITED',
 *   true,  // retryable
 *   'abc-123-def'
 * );
 * ```
 */
export class CloudWatchLogsError extends Error {
  /**
   * Error code identifying the error type.
   */
  public readonly code: CloudWatchLogsErrorCode;

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
   * Create a new CloudWatch Logs error.
   *
   * @param message - Human-readable error message
   * @param code - Error code
   * @param retryable - Whether the operation can be retried
   * @param requestId - AWS request ID (optional)
   * @param statusCode - HTTP status code (optional)
   */
  constructor(
    message: string,
    code: CloudWatchLogsErrorCode,
    retryable: boolean = false,
    requestId?: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "CloudWatchLogsError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.statusCode = statusCode;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CloudWatchLogsError);
    }

    Object.setPrototypeOf(this, CloudWatchLogsError.prototype);
  }

  /**
   * Check if an unknown error is retryable.
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof CloudWatchLogsError) {
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
  static getCode(error: unknown): CloudWatchLogsErrorCode {
    if (error instanceof CloudWatchLogsError) {
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
    if (error instanceof CloudWatchLogsError) {
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
 * Map AWS API error response to CloudWatch Logs error.
 *
 * Converts AWS error responses into appropriate CloudWatchLogsError instances
 * with correct error codes and retryability settings.
 *
 * @param response - AWS error response from API
 * @param statusCode - HTTP status code
 * @param requestId - AWS request ID
 * @returns Mapped CloudWatch Logs error
 *
 * @example
 * ```typescript
 * const error = mapAwsError(
 *   { __type: 'ResourceNotFoundException', message: 'Log group not found' },
 *   400,
 *   'req-123'
 * );
 * // Returns CloudWatchLogsError with code 'RESOURCE_NOT_FOUND'
 * ```
 */
export function mapAwsError(
  response: AwsErrorResponse,
  statusCode?: number,
  requestId?: string
): CloudWatchLogsError {
  const errorType = response.__type || "Unknown";
  const message = response.message || errorType;

  // Extract error code from __type (format: "com.amazonaws.logs#ErrorCode")
  const errorCode = errorType.includes("#") ? errorType.split("#")[1] : errorType;

  // Map AWS error codes to CloudWatch Logs error codes
  switch (errorCode) {
    // Resource not found errors
    case "ResourceNotFoundException":
      if (message.toLowerCase().includes("log group")) {
        return new CloudWatchLogsError(
          message,
          "RESOURCE_NOT_FOUND",
          false,
          requestId,
          statusCode
        );
      }
      if (message.toLowerCase().includes("log stream")) {
        return new CloudWatchLogsError(
          message,
          "RESOURCE_NOT_FOUND",
          false,
          requestId,
          statusCode
        );
      }
      return new CloudWatchLogsError(
        message,
        "RESOURCE_NOT_FOUND",
        false,
        requestId,
        statusCode
      );

    // Resource already exists
    case "ResourceAlreadyExistsException":
      return new CloudWatchLogsError(
        message,
        "RESOURCE_EXISTS",
        false,
        requestId,
        statusCode
      );

    // Limit exceeded
    case "LimitExceededException":
      return new CloudWatchLogsError(
        message,
        "LIMIT_EXCEEDED",
        false,
        requestId,
        statusCode
      );

    // Rate limiting and throttling (retryable)
    case "Throttling":
    case "ThrottlingException":
    case "TooManyRequestsException":
      return new CloudWatchLogsError(
        message,
        "RATE_LIMITED",
        true,
        requestId,
        statusCode
      );

    // Validation errors
    case "InvalidParameterException":
    case "ValidationException":
    case "InvalidParameterValue":
    case "MissingRequiredParameter":
      return new CloudWatchLogsError(message, "VALIDATION", false, requestId, statusCode);

    // Sequence token errors (retryable - can refresh token)
    case "InvalidSequenceTokenException":
      return new CloudWatchLogsError(
        message,
        "INVALID_SEQUENCE_TOKEN",
        true,
        requestId,
        statusCode
      );

    // Data already accepted (not retryable - idempotent success)
    case "DataAlreadyAcceptedException":
      return new CloudWatchLogsError(
        message,
        "DATA_ALREADY_ACCEPTED",
        false,
        requestId,
        statusCode
      );

    // Query errors
    case "MalformedQueryException":
    case "QueryCompilationException":
      return new CloudWatchLogsError(message, "QUERY_ERROR", false, requestId, statusCode);

    case "QueryExecutionException":
    case "QueryTimeoutException":
      return new CloudWatchLogsError(message, "QUERY_ERROR", false, requestId, statusCode);

    // Server errors (retryable)
    case "InternalServiceErrorException":
    case "InternalServerError":
    case "ServiceUnavailableException":
    case "ServiceUnavailable":
    case "InternalFailure":
      return new CloudWatchLogsError(
        message,
        "SERVER_ERROR",
        true,
        requestId,
        statusCode
      );

    // Timeout (retryable)
    case "RequestTimeout":
    case "RequestTimeoutException":
      return new CloudWatchLogsError(message, "TIMEOUT", true, requestId, statusCode);

    // Unrecognized client
    case "UnrecognizedClientException":
      return new CloudWatchLogsError(message, "CREDENTIAL", false, requestId, statusCode);

    // Default
    default:
      // Determine retryability based on status code
      const retryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
      return new CloudWatchLogsError(message, "AWS_API", retryable, requestId, statusCode);
  }
}

/**
 * Map HTTP status code to CloudWatch Logs error.
 *
 * Creates appropriate error for HTTP-level failures.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param requestId - AWS request ID
 * @returns CloudWatch Logs error
 */
export function mapHttpError(
  statusCode: number,
  body: string,
  requestId?: string
): CloudWatchLogsError {
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
    return new CloudWatchLogsError(message, "VALIDATION", false, requestId, statusCode);
  } else if (statusCode === 401 || statusCode === 403) {
    return new CloudWatchLogsError(message, "CREDENTIAL", false, requestId, statusCode);
  } else if (statusCode === 429) {
    return new CloudWatchLogsError(message, "RATE_LIMITED", true, requestId, statusCode);
  } else if (statusCode >= 500) {
    return new CloudWatchLogsError(message, "SERVER_ERROR", true, requestId, statusCode);
  }

  return new CloudWatchLogsError(message, "AWS_API", false, requestId, statusCode);
}

/**
 * Create a configuration error.
 *
 * @param message - Error message
 * @returns Configuration error
 */
export function configurationError(message: string): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "CONFIGURATION", false);
}

/**
 * Create a credential error.
 *
 * @param message - Error message
 * @returns Credential error
 */
export function credentialError(message: string): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "CREDENTIAL", false);
}

/**
 * Create a signing error.
 *
 * @param message - Error message
 * @returns Signing error
 */
export function signingError(message: string): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "SIGNING", false);
}

/**
 * Create a validation error.
 *
 * @param message - Error message
 * @returns Validation error
 */
export function validationError(message: string): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "VALIDATION", false);
}

/**
 * Create a transport error.
 *
 * @param message - Error message
 * @param retryable - Whether the error is retryable
 * @returns Transport error
 */
export function transportError(
  message: string,
  retryable: boolean = true
): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "TRANSPORT", retryable);
}

/**
 * Create a timeout error.
 *
 * @param message - Error message
 * @returns Timeout error
 */
export function timeoutError(message: string): CloudWatchLogsError {
  return new CloudWatchLogsError(message, "TIMEOUT", true);
}

/**
 * Wrap an unknown error as a CloudWatch Logs error.
 *
 * @param error - Error to wrap
 * @param defaultCode - Default error code if unknown
 * @returns CloudWatch Logs error
 */
export function wrapError(
  error: unknown,
  defaultCode: CloudWatchLogsErrorCode = "UNKNOWN"
): CloudWatchLogsError {
  if (error instanceof CloudWatchLogsError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for network/fetch errors
    if (error.name === "AbortError" || error.message.includes("aborted")) {
      return new CloudWatchLogsError("Request aborted", "TIMEOUT", true);
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return new CloudWatchLogsError(
        `Network error: ${error.message}`,
        "TRANSPORT",
        true
      );
    }

    return new CloudWatchLogsError(error.message, defaultCode, false);
  }

  return new CloudWatchLogsError(String(error), defaultCode, false);
}
