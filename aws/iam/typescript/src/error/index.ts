/**
 * AWS IAM/STS Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 * Provides detailed error types for all IAM/STS operations with proper
 * categorization and retryability information.
 *
 * @module error
 */

/**
 * IAM/STS error codes.
 *
 * Categorizes errors by their source and type for better error handling.
 */
export type IamErrorCode =
  | "CONFIGURATION" // Invalid configuration
  | "CREDENTIAL" // Credential-related errors
  | "SIGNING" // Request signing errors
  | "TRANSPORT" // Network/HTTP transport errors
  | "TIMEOUT" // Request timeout
  | "RATE_LIMITED" // Rate limiting/throttling
  | "ACCESS_DENIED" // Access denied/authorization errors
  | "ROLE_NOT_FOUND" // Role does not exist
  | "INVALID_EXTERNAL_ID" // External ID mismatch
  | "SESSION_DURATION_EXCEEDED" // Session duration exceeds maximum
  | "ROLE_CHAIN_LIMIT" // Role chaining limit exceeded
  | "TRUST_POLICY_VIOLATION" // Trust policy does not allow assumption
  | "INVALID_IDENTITY_TOKEN" // Invalid OIDC/SAML token
  | "EXPIRED_TOKEN" // Expired token
  | "IDP_COMMUNICATION_ERROR" // Identity provider communication error
  | "SIMULATION_ERROR" // Policy simulation error
  | "NO_SUCH_ENTITY" // Entity does not exist
  | "MALFORMED_POLICY" // Malformed policy document
  | "PACKED_POLICY_SIZE_EXCEEDED" // Packed policy size exceeded
  | "REGION_DISABLED" // Region is disabled
  | "AWS_API" // AWS API error
  | "UNKNOWN"; // Unknown error

/**
 * Base IAM error class.
 *
 * All IAM errors extend this class. Contains error code, message,
 * retryability information, and optional AWS request ID.
 *
 * @example
 * ```typescript
 * throw new IamError(
 *   'Role not found',
 *   'ROLE_NOT_FOUND',
 *   false,  // not retryable
 *   'abc-123-def'
 * );
 * ```
 */
export class IamError extends Error {
  /**
   * Error code identifying the error type.
   */
  public readonly code: IamErrorCode;

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
   * Create a new IAM error.
   *
   * @param message - Human-readable error message
   * @param code - Error code
   * @param retryable - Whether the operation can be retried
   * @param requestId - AWS request ID (optional)
   * @param statusCode - HTTP status code (optional)
   */
  constructor(
    message: string,
    code: IamErrorCode,
    retryable: boolean = false,
    requestId?: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "IamError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.statusCode = statusCode;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IamError);
    }

    Object.setPrototypeOf(this, IamError.prototype);
  }

  /**
   * Check if an unknown error is retryable.
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof IamError) {
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
  static getCode(error: unknown): IamErrorCode {
    if (error instanceof IamError) {
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
    if (error instanceof IamError) {
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
 * Simple XML element extraction.
 *
 * @internal
 */
function extractElement(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "s");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

/**
 * XML error response structure (STS/IAM).
 *
 * @internal
 */
interface XmlErrorResponse {
  code?: string;
  message?: string;
  requestId?: string;
}

/**
 * Parse XML error response from STS.
 *
 * STS returns errors in XML format like:
 * ```xml
 * <ErrorResponse>
 *   <Error>
 *     <Type>Sender</Type>
 *     <Code>AccessDenied</Code>
 *     <Message>User is not authorized...</Message>
 *   </Error>
 *   <RequestId>abc-123</RequestId>
 * </ErrorResponse>
 * ```
 *
 * @internal
 */
function parseXmlError(xml: string): XmlErrorResponse {
  return {
    code: extractElement(xml, "Code"),
    message: extractElement(xml, "Message"),
    requestId: extractElement(xml, "RequestId"),
  };
}

/**
 * Map STS XML error response to IAM error.
 *
 * Converts STS error responses into appropriate IamError instances
 * with correct error codes and retryability settings.
 *
 * @param xml - XML error response from STS
 * @param statusCode - HTTP status code
 * @returns Mapped IAM error
 *
 * @example
 * ```typescript
 * const error = mapStsError(
 *   '<ErrorResponse>...</ErrorResponse>',
 *   403
 * );
 * ```
 */
export function mapStsError(xml: string, statusCode?: number): IamError {
  const parsed = parseXmlError(xml);
  const errorCode = parsed.code || "Unknown";
  const message = parsed.message || errorCode;
  const requestId = parsed.requestId;

  // Map AWS STS error codes to IAM error codes
  switch (errorCode) {
    // Access/Authorization errors
    case "AccessDenied":
    case "AccessDeniedException":
      return new IamError(message, "ACCESS_DENIED", false, requestId, statusCode);

    case "UnauthorizedOperation":
      return new IamError(message, "ACCESS_DENIED", false, requestId, statusCode);

    // Role-related errors
    case "NoSuchEntity":
    case "NoSuchEntityException":
      return new IamError(message, "ROLE_NOT_FOUND", false, requestId, statusCode);

    case "InvalidIdentityToken":
    case "InvalidIdentityTokenException":
      return new IamError(message, "INVALID_IDENTITY_TOKEN", false, requestId, statusCode);

    case "ExpiredToken":
    case "ExpiredTokenException":
      return new IamError(message, "EXPIRED_TOKEN", false, requestId, statusCode);

    case "IDPCommunicationError":
    case "IDPCommunicationErrorException":
      return new IamError(message, "IDP_COMMUNICATION_ERROR", true, requestId, statusCode);

    // Policy-related errors
    case "MalformedPolicyDocument":
    case "MalformedPolicyDocumentException":
      return new IamError(message, "MALFORMED_POLICY", false, requestId, statusCode);

    case "PackedPolicySizeExceeded":
    case "PackedPolicySizeExceededException":
      return new IamError(message, "PACKED_POLICY_SIZE_EXCEEDED", false, requestId, statusCode);

    // Session/Duration errors
    case "InvalidInput":
      if (message.toLowerCase().includes("duration")) {
        return new IamError(message, "SESSION_DURATION_EXCEEDED", false, requestId, statusCode);
      }
      if (message.toLowerCase().includes("external")) {
        return new IamError(message, "INVALID_EXTERNAL_ID", false, requestId, statusCode);
      }
      return new IamError(message, "CONFIGURATION", false, requestId, statusCode);

    case "ValidationError":
    case "ValidationException":
      return new IamError(message, "CONFIGURATION", false, requestId, statusCode);

    // Region errors
    case "RegionDisabledException":
      return new IamError(message, "REGION_DISABLED", false, requestId, statusCode);

    // Rate limiting and throttling
    case "Throttling":
    case "ThrottlingException":
    case "TooManyRequestsException":
      return new IamError(message, "RATE_LIMITED", true, requestId, statusCode);

    // Service errors (retryable)
    case "InternalError":
    case "InternalFailure":
    case "InternalServiceError":
    case "ServiceUnavailable":
    case "ServiceUnavailableException":
      return new IamError(message, "AWS_API", true, requestId, statusCode);

    // Timeout
    case "RequestTimeout":
    case "RequestTimeoutException":
      return new IamError(message, "TIMEOUT", true, requestId, statusCode);

    // Signature/Credential errors
    case "SignatureDoesNotMatch":
    case "InvalidClientTokenId":
    case "IncompleteSignature":
      return new IamError(message, "CREDENTIAL", false, requestId, statusCode);

    // Default
    default:
      // Determine retryability based on status code
      const retryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
      return new IamError(message, "AWS_API", retryable, requestId, statusCode);
  }
}

/**
 * Map IAM XML error response to IAM error.
 *
 * Converts IAM error responses into appropriate IamError instances.
 * IAM uses similar XML format to STS but for different operations.
 *
 * @param xml - XML error response from IAM
 * @param statusCode - HTTP status code
 * @returns Mapped IAM error
 *
 * @example
 * ```typescript
 * const error = mapIamError(
 *   '<ErrorResponse>...</ErrorResponse>',
 *   404
 * );
 * ```
 */
export function mapIamError(xml: string, statusCode?: number): IamError {
  const parsed = parseXmlError(xml);
  const errorCode = parsed.code || "Unknown";
  const message = parsed.message || errorCode;
  const requestId = parsed.requestId;

  // Map AWS IAM error codes to IAM error codes
  switch (errorCode) {
    // Entity errors
    case "NoSuchEntity":
    case "NoSuchEntityException":
      return new IamError(message, "NO_SUCH_ENTITY", false, requestId, statusCode);

    // Access errors
    case "AccessDenied":
    case "AccessDeniedException":
      return new IamError(message, "ACCESS_DENIED", false, requestId, statusCode);

    // Policy errors
    case "MalformedPolicyDocument":
    case "MalformedPolicyDocumentException":
      return new IamError(message, "MALFORMED_POLICY", false, requestId, statusCode);

    case "InvalidInput":
    case "InvalidInputException":
      return new IamError(message, "SIMULATION_ERROR", false, requestId, statusCode);

    // Rate limiting
    case "Throttling":
    case "ThrottlingException":
      return new IamError(message, "RATE_LIMITED", true, requestId, statusCode);

    // Service errors
    case "ServiceFailure":
    case "ServiceFailureException":
      return new IamError(message, "AWS_API", true, requestId, statusCode);

    // Default - delegate to STS error mapper for common errors
    default:
      return mapStsError(xml, statusCode);
  }
}

/**
 * Map HTTP status code to IAM error.
 *
 * Creates appropriate error for HTTP-level failures when
 * the response body is not parseable XML.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param requestId - AWS request ID
 * @returns IAM error
 */
export function mapHttpError(statusCode: number, body: string, requestId?: string): IamError {
  let message = `HTTP ${statusCode}`;

  // Try to parse error from XML body
  try {
    if (body.includes("<ErrorResponse>") || body.includes("<Error>")) {
      return mapStsError(body, statusCode);
    }
  } catch {
    // Not parseable XML, use body as message if short enough
    if (body.length > 0 && body.length < 200) {
      message = body;
    }
  }

  // Map by status code
  if (statusCode === 400) {
    return new IamError(message, "CONFIGURATION", false, requestId, statusCode);
  } else if (statusCode === 401 || statusCode === 403) {
    return new IamError(message, "ACCESS_DENIED", false, requestId, statusCode);
  } else if (statusCode === 404) {
    return new IamError(message, "ROLE_NOT_FOUND", false, requestId, statusCode);
  } else if (statusCode === 429) {
    return new IamError(message, "RATE_LIMITED", true, requestId, statusCode);
  } else if (statusCode >= 500) {
    return new IamError(message, "AWS_API", true, requestId, statusCode);
  }

  return new IamError(message, "AWS_API", false, requestId, statusCode);
}

/**
 * Create a configuration error.
 *
 * Used for invalid client configuration, parameters, etc.
 *
 * @param message - Error message
 * @returns Configuration error
 *
 * @example
 * ```typescript
 * throw configurationError('Invalid role ARN format');
 * ```
 */
export function configurationError(message: string): IamError {
  return new IamError(message, "CONFIGURATION", false);
}

/**
 * Create a credential error.
 *
 * Used for credential-related issues like invalid keys, signature mismatches, etc.
 *
 * @param message - Error message
 * @returns Credential error
 *
 * @example
 * ```typescript
 * throw credentialError('Invalid AWS credentials');
 * ```
 */
export function credentialError(message: string): IamError {
  return new IamError(message, "CREDENTIAL", false);
}

/**
 * Create a signing error.
 *
 * Used for SigV4 signing failures.
 *
 * @param message - Error message
 * @returns Signing error
 *
 * @example
 * ```typescript
 * throw signingError('Failed to sign request');
 * ```
 */
export function signingError(message: string): IamError {
  return new IamError(message, "SIGNING", false);
}

/**
 * Create an access denied error.
 *
 * Used when IAM policies deny access to a resource or action.
 *
 * @param message - Error message
 * @returns Access denied error
 *
 * @example
 * ```typescript
 * throw accessDeniedError('User is not authorized to assume this role');
 * ```
 */
export function accessDeniedError(message: string): IamError {
  return new IamError(message, "ACCESS_DENIED", false);
}

/**
 * Create a role not found error.
 *
 * Used when a specified role does not exist.
 *
 * @param roleArn - Role ARN that was not found
 * @returns Role not found error
 *
 * @example
 * ```typescript
 * throw roleNotFoundError('arn:aws:iam::123456789012:role/MyRole');
 * ```
 */
export function roleNotFoundError(roleArn: string): IamError {
  return new IamError(`Role not found: ${roleArn}`, "ROLE_NOT_FOUND", false);
}

/**
 * Create a transport error.
 *
 * Used for network-level transport errors.
 *
 * @param message - Error message
 * @param retryable - Whether the error is retryable
 * @returns Transport error
 *
 * @example
 * ```typescript
 * throw transportError('Connection refused', true);
 * ```
 */
export function transportError(message: string, retryable: boolean = true): IamError {
  return new IamError(message, "TRANSPORT", retryable);
}

/**
 * Create a timeout error.
 *
 * Used when a request times out.
 *
 * @param message - Error message
 * @returns Timeout error
 *
 * @example
 * ```typescript
 * throw timeoutError('Request timed out after 30 seconds');
 * ```
 */
export function timeoutError(message: string): IamError {
  return new IamError(message, "TIMEOUT", true);
}

/**
 * Wrap an unknown error as an IAM error.
 *
 * Converts arbitrary errors into IamError instances for consistent
 * error handling throughout the integration.
 *
 * @param error - Error to wrap
 * @param defaultCode - Default error code if unknown
 * @returns IAM error
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw wrapError(error);
 * }
 * ```
 */
export function wrapError(error: unknown, defaultCode: IamErrorCode = "UNKNOWN"): IamError {
  if (error instanceof IamError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for network/fetch errors
    if (error.name === "AbortError" || error.message.includes("aborted")) {
      return new IamError("Request aborted", "TIMEOUT", true);
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return new IamError(`Network error: ${error.message}`, "TRANSPORT", true);
    }

    return new IamError(error.message, defaultCode, false);
  }

  return new IamError(String(error), defaultCode, false);
}
