/**
 * Error mapping utilities for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/errors/mapping
 */

import { R2Error } from './error.js';
import {
  AuthError,
  BucketError,
  MultipartError,
  NetworkError,
  ObjectError,
  ServerError,
  TransferError,
  ValidationError,
} from './categories.js';

/**
 * Maps HTTP status codes to appropriate R2Error instances
 *
 * @param status - HTTP status code
 * @param code - Optional R2/S3 error code
 * @param message - Optional error message
 * @param requestId - Optional request ID
 * @returns Appropriate R2Error instance
 */
export function mapHttpStatusToError(
  status: number,
  code?: string,
  message?: string,
  requestId?: string
): R2Error {
  // If we have an error code, use that for more specific mapping
  if (code) {
    return mapS3ErrorCode(code, message ?? 'An error occurred', requestId);
  }

  // Fall back to status code mapping
  const errorMessage = message ?? getDefaultMessageForStatus(status);

  switch (status) {
    // 3xx - Redirection (not modified is handled specially)
    case 304:
      return ObjectError.notModified(requestId);

    // 4xx - Client Errors
    case 400:
      return new ValidationError({
        message: errorMessage,
        code: 'BadRequest',
        status,
        isRetryable: false,
        requestId,
      });

    case 401:
      return new AuthError({
        message: errorMessage,
        code: 'Unauthorized',
        status,
        isRetryable: false,
        requestId,
      });

    case 403:
      return AuthError.accessDenied(undefined, requestId);

    case 404:
      return new ObjectError({
        message: errorMessage,
        code: 'NotFound',
        status,
        isRetryable: false,
        requestId,
      });

    case 408:
      return NetworkError.timeout(30000);

    case 409:
      return new ValidationError({
        message: errorMessage,
        code: 'Conflict',
        status,
        isRetryable: false,
        requestId,
      });

    case 412:
      return ObjectError.preconditionFailed(errorMessage, requestId);

    case 413:
      return ObjectError.entityTooLarge(undefined, requestId);

    case 416:
      return new ObjectError({
        message: errorMessage,
        code: 'InvalidRange',
        status,
        isRetryable: false,
        requestId,
      });

    case 429:
      return ServerError.slowDown(undefined, requestId);

    // 5xx - Server Errors (all retryable)
    case 500:
      return ServerError.internalError(requestId);

    case 502:
      return ServerError.badGateway(requestId);

    case 503:
      return ServerError.serviceUnavailable(undefined, requestId);

    case 504:
      return ServerError.gatewayTimeout(requestId);

    // Unknown status code
    default:
      const isRetryable = status >= 500 && status < 600;
      return new R2Error({
        type: isRetryable ? 'server_error' : 'unknown_error',
        message: errorMessage,
        status,
        isRetryable,
        requestId,
      });
  }
}

/**
 * Maps S3/R2 error codes to specific error instances
 *
 * @param code - S3/R2 error code
 * @param message - Error message
 * @param requestId - Optional request ID
 * @returns Appropriate R2Error instance
 */
export function mapS3ErrorCode(code: string, message: string, requestId?: string): R2Error {
  switch (code) {
    // Authentication errors
    case 'InvalidAccessKeyId':
      return AuthError.invalidAccessKey(requestId);
    case 'SignatureDoesNotMatch':
      return AuthError.signatureDoesNotMatch(requestId);
    case 'ExpiredToken':
    case 'TokenRefreshRequired':
      return AuthError.expiredCredentials(requestId);
    case 'AccessDenied':
      return AuthError.accessDenied(undefined, requestId);
    case 'InvalidToken':
    case 'InvalidSecurity':
      return AuthError.invalidToken(requestId);

    // Bucket errors
    case 'NoSuchBucket':
      return new BucketError({
        message,
        code,
        status: 404,
        isRetryable: false,
        requestId,
      });
    case 'BucketAlreadyExists':
      return new BucketError({
        message,
        code,
        status: 409,
        isRetryable: false,
        requestId,
      });
    case 'BucketAlreadyOwnedByYou':
      return new BucketError({
        message,
        code,
        status: 409,
        isRetryable: false,
        requestId,
      });
    case 'AllAccessDisabled':
      return new BucketError({
        message,
        code,
        status: 403,
        isRetryable: false,
        requestId,
      });

    // Object errors
    case 'NoSuchKey':
      return new ObjectError({
        message,
        code,
        status: 404,
        isRetryable: false,
        requestId,
      });
    case 'PreconditionFailed':
      return ObjectError.preconditionFailed(message, requestId);
    case 'NotModified':
      return ObjectError.notModified(requestId);
    case 'EntityTooLarge':
      return ObjectError.entityTooLarge(undefined, requestId);
    case 'InvalidObjectState':
      return new ObjectError({
        message,
        code,
        status: 403,
        isRetryable: false,
        requestId,
      });
    case 'ObjectLocked':
      return new ObjectError({
        message,
        code,
        status: 403,
        isRetryable: false,
        requestId,
      });
    case 'InvalidRange':
      return new ObjectError({
        message,
        code,
        status: 416,
        isRetryable: false,
        requestId,
      });

    // Multipart errors
    case 'NoSuchUpload':
      return new MultipartError({
        message,
        code,
        status: 404,
        isRetryable: false,
        requestId,
      });
    case 'InvalidPart':
      return new MultipartError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'InvalidPartOrder':
      return MultipartError.invalidPartOrder(requestId);
    case 'EntityTooSmall':
      return new MultipartError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'TooManyParts':
      return MultipartError.tooManyParts(requestId);

    // Transfer errors
    case 'BadDigest':
      return TransferError.checksumMismatch(undefined, undefined, requestId);
    case 'IncompleteBody':
      return new TransferError({
        message,
        code,
        status: 400,
        isRetryable: true,
        requestId,
      });
    case 'InvalidDigest':
      return TransferError.invalidDigest(requestId);
    case 'RequestEntityTooLarge':
      return TransferError.requestEntityTooLarge(requestId);

    // Validation errors
    case 'InvalidArgument':
    case 'InvalidParameter':
      return new ValidationError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'MissingParameter':
    case 'MissingSecurityHeader':
      return new ValidationError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'InvalidBucketName':
      return new ValidationError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'KeyTooLong':
    case 'InvalidKey':
      return new ValidationError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });
    case 'MalformedXML':
    case 'InvalidRequest':
      return new ValidationError({
        message,
        code,
        status: 400,
        isRetryable: false,
        requestId,
      });

    // Server errors
    case 'InternalError':
      return ServerError.internalError(requestId);
    case 'ServiceUnavailable':
      return ServerError.serviceUnavailable(undefined, requestId);
    case 'SlowDown':
      return ServerError.slowDown(undefined, requestId);

    // Network errors
    case 'RequestTimeout':
      return NetworkError.timeout(30000);

    // Unknown error code
    default:
      return new R2Error({
        type: 'unknown_error',
        message,
        code,
        isRetryable: false,
        requestId,
      });
  }
}

/**
 * Checks if an error is retryable
 *
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (isR2Error(error)) {
    return error.isRetryable;
  }

  // Check for common Node.js network errors
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code) {
      return isRetryableNodeError(code);
    }
  }

  return false;
}

/**
 * Type guard to check if an error is an R2Error
 *
 * @param error - Error to check
 * @returns True if the error is an R2Error instance
 */
export function isR2Error(error: unknown): error is R2Error {
  return error instanceof R2Error;
}

/**
 * Checks if a Node.js error code is retryable
 *
 * @param code - Node.js error code
 * @returns True if the error is retryable
 */
function isRetryableNodeError(code: string): boolean {
  const retryableCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'EPIPE',
    'ECONNABORTED',
  ]);

  return retryableCodes.has(code);
}

/**
 * Gets a default error message for an HTTP status code
 *
 * @param status - HTTP status code
 * @returns Default error message
 */
function getDefaultMessageForStatus(status: number): string {
  switch (status) {
    case 304:
      return 'Not Modified';
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 408:
      return 'Request Timeout';
    case 409:
      return 'Conflict';
    case 412:
      return 'Precondition Failed';
    case 413:
      return 'Request Entity Too Large';
    case 416:
      return 'Requested Range Not Satisfiable';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return `HTTP Error ${status}`;
  }
}

/**
 * Extracts error information from an AWS SDK error
 *
 * @param error - AWS SDK error object
 * @returns Mapped R2Error
 */
export function mapAwsSdkError(error: any): R2Error {
  const code = error?.Code || error?.code || error?.name;
  const message = error?.Message || error?.message || 'An error occurred';
  const statusCode = error?.$metadata?.httpStatusCode || error?.statusCode || error?.$response?.statusCode;
  const requestId = error?.$metadata?.requestId || error?.requestId;

  if (code) {
    return mapS3ErrorCode(code, message, requestId);
  }

  if (statusCode) {
    return mapHttpStatusToError(statusCode, undefined, message, requestId);
  }

  return new R2Error({
    type: 'unknown_error',
    message,
    isRetryable: false,
    details: { originalError: error },
  });
}

/**
 * Wraps an unknown error in an R2Error
 *
 * @param error - Error to wrap
 * @returns R2Error instance
 */
export function wrapError(error: unknown): R2Error {
  if (isR2Error(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check if it's an AWS SDK error
    if ('Code' in error || '$metadata' in error) {
      return mapAwsSdkError(error);
    }

    // Check for Node.js network errors
    const code = (error as NodeJS.ErrnoException).code;
    if (code) {
      return new NetworkError({
        message: error.message,
        code,
        isRetryable: isRetryableNodeError(code),
      });
    }

    // Generic error wrapping
    return new R2Error({
      type: 'unknown_error',
      message: error.message,
      isRetryable: false,
      details: {
        name: error.name,
        stack: error.stack,
      },
    });
  }

  // Unknown error type
  return new R2Error({
    type: 'unknown_error',
    message: String(error),
    isRetryable: false,
  });
}
