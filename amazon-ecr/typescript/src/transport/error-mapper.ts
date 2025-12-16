/**
 * Error mapping utilities for Amazon ECR transport layer.
 *
 * This module maps AWS SDK errors to typed EcrError instances with:
 * - Error kind classification
 * - Retry-ability detection
 * - Request ID extraction
 * - Status code mapping
 *
 * @module transport/error-mapper
 */

import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * AWS error response structure.
 */
export interface AwsErrorResponse {
  /** Error code from AWS. */
  readonly code?: string;
  /** Error name from AWS SDK. */
  readonly name?: string;
  /** Error message. */
  readonly message: string;
  /** HTTP status code. */
  readonly statusCode?: number;
  /** AWS request ID. */
  readonly requestId?: string;
  /** Retry-After header value. */
  readonly retryAfter?: number;
  /** Original error object. */
  readonly $metadata?: {
    requestId?: string;
    httpStatusCode?: number;
    attempts?: number;
    totalRetryDelay?: number;
  };
}

/**
 * Map AWS SDK error to EcrError.
 *
 * This function handles AWS SDK v3 errors and HTTP errors,
 * extracting relevant metadata and classifying the error type.
 *
 * @param error - Error from AWS SDK or HTTP transport
 * @returns Typed EcrError with appropriate classification
 */
export function mapAwsError(error: any): EcrError {
  // Already an EcrError
  if (error instanceof EcrError) {
    return error;
  }

  // Extract error information
  const errorCode = extractErrorCode(error);
  const message = extractErrorMessage(error);
  const statusCode = extractStatusCode(error);
  const requestId = extractRequestId(error);
  const retryAfter = extractRetryAfter(error);

  // Map to error kind
  const kind = mapErrorCodeToKind(errorCode, statusCode);

  // Create EcrError
  const ecrError = new EcrError(kind, message, {
    statusCode,
    requestId,
    retryAfter,
    cause: error instanceof Error ? error : undefined,
  });

  return ecrError;
}

/**
 * Extract error code from AWS error.
 */
function extractErrorCode(error: any): string | undefined {
  return (
    error.code ||
    error.Code ||
    error.name ||
    error.__type ||
    error.$metadata?.errorCode
  );
}

/**
 * Extract error message from AWS error.
 */
function extractErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  return (
    error.message ||
    error.Message ||
    error.$metadata?.message ||
    'Unknown ECR error'
  );
}

/**
 * Extract HTTP status code from AWS error.
 */
function extractStatusCode(error: any): number | undefined {
  return (
    error.statusCode ||
    error.$statusCode ||
    error.$metadata?.httpStatusCode ||
    error.$response?.statusCode
  );
}

/**
 * Extract AWS request ID from error.
 */
function extractRequestId(error: any): string | undefined {
  return (
    error.requestId ||
    error.$metadata?.requestId ||
    error.$response?.headers?.['x-amzn-requestid'] ||
    error.$response?.headers?.['x-amz-request-id']
  );
}

/**
 * Extract Retry-After header value.
 */
function extractRetryAfter(error: any): number | undefined {
  const retryAfter =
    error.retryAfter ||
    error.$response?.headers?.['retry-after'];

  if (retryAfter) {
    const seconds = parseInt(String(retryAfter), 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
  }

  return undefined;
}

/**
 * Map AWS error code and status to EcrErrorKind.
 *
 * Maps specific AWS ECR error codes to typed error kinds.
 * Falls back to HTTP status code mapping if error code is unknown.
 */
function mapErrorCodeToKind(
  errorCode?: string,
  statusCode?: number
): EcrErrorKind {
  // Map by AWS error code
  if (errorCode) {
    const kind = mapAwsErrorCode(errorCode);
    if (kind !== EcrErrorKind.Unknown) {
      return kind;
    }
  }

  // Fallback to HTTP status code
  if (statusCode) {
    return mapHttpStatusCode(statusCode);
  }

  return EcrErrorKind.Unknown;
}

/**
 * Map AWS ECR error code to error kind.
 */
function mapAwsErrorCode(code: string): EcrErrorKind {
  // Normalize error code (remove "Exception" suffix if present)
  const normalized = code.replace(/Exception$/, '');

  switch (normalized) {
    // Resource not found errors
    case 'RepositoryNotFound':
    case 'RepositoryNotFoundException':
      return EcrErrorKind.RepositoryNotFound;

    case 'ImageNotFound':
    case 'ImageNotFoundException':
      return EcrErrorKind.ImageNotFound;

    case 'LayersNotFound':
    case 'LayersNotFoundException':
      return EcrErrorKind.LayersNotFound;

    case 'LifecyclePolicyNotFound':
    case 'LifecyclePolicyNotFoundException':
      return EcrErrorKind.LifecyclePolicyNotFound;

    case 'RepositoryPolicyNotFound':
    case 'RepositoryPolicyNotFoundException':
      return EcrErrorKind.RepositoryPolicyNotFound;

    case 'ScanNotFound':
    case 'ScanNotFoundException':
      return EcrErrorKind.ScanNotFound;

    // Request validation errors
    case 'InvalidParameter':
    case 'InvalidParameterException':
    case 'ValidationError':
    case 'ValidationException':
      return EcrErrorKind.InvalidParameter;

    case 'InvalidLayerPart':
    case 'InvalidLayerPartException':
      return EcrErrorKind.InvalidLayerPart;

    // Limit errors
    case 'LimitExceeded':
    case 'LimitExceededException':
      return EcrErrorKind.LimitExceeded;

    case 'TooManyTags':
    case 'TooManyTagsException':
      return EcrErrorKind.TooManyTags;

    // Image operation errors
    case 'ImageTagAlreadyExists':
    case 'ImageTagAlreadyExistsException':
      return EcrErrorKind.ImageTagAlreadyExists;

    case 'ImageDigestDoesNotMatch':
    case 'ImageDigestDoesNotMatchException':
      return EcrErrorKind.ImageDigestMismatch;

    // Authorization errors
    case 'AccessDenied':
    case 'AccessDeniedException':
    case 'UnauthorizedOperation':
    case 'UnauthorizedException':
      return EcrErrorKind.AccessDenied;

    // KMS errors
    case 'Kms':
    case 'KmsException':
    case 'KmsDisabled':
    case 'KmsDisabledException':
    case 'KmsInvalidState':
    case 'KmsInvalidStateException':
      return EcrErrorKind.KmsError;

    // Service errors
    case 'Server':
    case 'ServerException':
    case 'InternalError':
    case 'InternalServerError':
    case 'ServiceUnavailable':
    case 'ServiceUnavailableException':
      return EcrErrorKind.ServiceUnavailable;

    // Throttling errors
    case 'Throttling':
    case 'ThrottlingException':
    case 'TooManyRequests':
    case 'TooManyRequestsException':
    case 'RequestLimitExceeded':
      return EcrErrorKind.ThrottlingException;

    // Scan errors
    case 'ScanInProgress':
    case 'ScanInProgressException':
      return EcrErrorKind.ScanInProgress;

    case 'ScanFailed':
    case 'ScanFailedException':
      return EcrErrorKind.ScanFailed;

    // Network errors
    case 'RequestTimeout':
    case 'TimeoutError':
      return EcrErrorKind.Timeout;

    case 'NetworkingError':
    case 'ConnectionError':
      return EcrErrorKind.ConnectionFailed;

    default:
      return EcrErrorKind.Unknown;
  }
}

/**
 * Map HTTP status code to error kind.
 */
function mapHttpStatusCode(statusCode: number): EcrErrorKind {
  switch (statusCode) {
    case 400:
      return EcrErrorKind.InvalidParameter;

    case 401:
    case 403:
      return EcrErrorKind.AccessDenied;

    case 404:
      return EcrErrorKind.RepositoryNotFound;

    case 408:
      return EcrErrorKind.Timeout;

    case 409:
      return EcrErrorKind.ImageTagAlreadyExists;

    case 429:
      return EcrErrorKind.ThrottlingException;

    case 500:
    case 502:
    case 503:
    case 504:
      return EcrErrorKind.ServiceUnavailable;

    default:
      return EcrErrorKind.Unknown;
  }
}

/**
 * Check if an AWS error is retryable.
 *
 * Retryable errors include:
 * - Throttling errors (with backoff)
 * - Service unavailable errors
 * - Timeout errors
 * - Some KMS errors
 * - Network errors
 */
export function isRetryableAwsError(error: any): boolean {
  const errorCode = extractErrorCode(error);
  const statusCode = extractStatusCode(error);

  // Check error code
  if (errorCode) {
    const retryableCodes = [
      'ThrottlingException',
      'TooManyRequestsException',
      'RequestLimitExceeded',
      'LimitExceededException',
      'ServiceUnavailableException',
      'ServerException',
      'InternalError',
      'TimeoutError',
      'RequestTimeout',
      'NetworkingError',
      'ConnectionError',
      'KmsException',
      'KmsDisabledException',
    ];

    if (retryableCodes.some((code) => errorCode.includes(code))) {
      return true;
    }
  }

  // Check status code
  if (statusCode) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(statusCode);
  }

  return false;
}

/**
 * Get recommended retry delay for an error.
 *
 * Uses Retry-After header if present, otherwise applies
 * default backoff strategy.
 */
export function getRetryDelay(error: any, attemptNumber: number): number {
  const retryAfter = extractRetryAfter(error);

  if (retryAfter !== undefined) {
    return retryAfter * 1000; // Convert to milliseconds
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, etc.
  // Max delay: 30 seconds
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);

  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);

  return Math.max(delay + jitter, 0);
}

/**
 * Check if an error indicates a not found resource.
 */
export function isNotFoundError(error: any): boolean {
  const errorCode = extractErrorCode(error);
  const statusCode = extractStatusCode(error);

  if (errorCode) {
    const notFoundCodes = [
      'RepositoryNotFoundException',
      'ImageNotFoundException',
      'LayersNotFoundException',
      'LifecyclePolicyNotFoundException',
      'RepositoryPolicyNotFoundException',
      'ScanNotFoundException',
    ];

    if (notFoundCodes.some((code) => errorCode.includes(code))) {
      return true;
    }
  }

  return statusCode === 404;
}

/**
 * Check if an error indicates an access denied condition.
 */
export function isAccessDeniedError(error: any): boolean {
  const errorCode = extractErrorCode(error);
  const statusCode = extractStatusCode(error);

  if (errorCode) {
    const accessDeniedCodes = [
      'AccessDeniedException',
      'UnauthorizedException',
      'UnauthorizedOperation',
    ];

    if (accessDeniedCodes.some((code) => errorCode.includes(code))) {
      return true;
    }
  }

  return statusCode === 403 || statusCode === 401;
}

/**
 * Check if an error indicates throttling.
 */
export function isThrottlingError(error: any): boolean {
  const errorCode = extractErrorCode(error);
  const statusCode = extractStatusCode(error);

  if (errorCode) {
    const throttlingCodes = [
      'ThrottlingException',
      'TooManyRequestsException',
      'RequestLimitExceeded',
      'LimitExceededException',
    ];

    if (throttlingCodes.some((code) => errorCode.includes(code))) {
      return true;
    }
  }

  return statusCode === 429;
}
