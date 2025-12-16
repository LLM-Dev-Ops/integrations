/**
 * Specific error categories for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/errors/categories
 */

import { R2Error, type R2ErrorParams } from './error.js';

/**
 * Configuration and initialization errors
 */
export class ConfigError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'config_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }

  /**
   * Missing account ID in configuration
   */
  static missingAccountId(message?: string): ConfigError {
    return new ConfigError({
      message: message ?? 'Account ID is required but not provided',
      code: 'MISSING_ACCOUNT_ID',
      isRetryable: false,
    });
  }

  /**
   * Missing credentials (access key ID or secret access key)
   */
  static missingCredentials(message?: string): ConfigError {
    return new ConfigError({
      message: message ?? 'AWS credentials (access key ID and secret access key) are required',
      code: 'MISSING_CREDENTIALS',
      isRetryable: false,
    });
  }

  /**
   * Invalid endpoint URL
   */
  static invalidEndpoint(endpoint: string, message?: string): ConfigError {
    return new ConfigError({
      message: message ?? `Invalid endpoint URL: ${endpoint}`,
      code: 'INVALID_ENDPOINT',
      isRetryable: false,
      details: { endpoint },
    });
  }

  /**
   * Invalid configuration parameter
   */
  static invalidConfig(paramName: string, message?: string): ConfigError {
    return new ConfigError({
      message: message ?? `Invalid configuration parameter: ${paramName}`,
      code: 'INVALID_CONFIG',
      isRetryable: false,
      details: { paramName },
    });
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'auth_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'AuthError';
    Object.setPrototypeOf(this, AuthError.prototype);
  }

  /**
   * Invalid access key ID
   */
  static invalidAccessKey(requestId?: string): AuthError {
    return new AuthError({
      message: 'The AWS Access Key ID you provided does not exist in our records',
      code: 'InvalidAccessKeyId',
      status: 403,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Signature does not match
   */
  static signatureDoesNotMatch(requestId?: string): AuthError {
    return new AuthError({
      message: 'The request signature we calculated does not match the signature you provided',
      code: 'SignatureDoesNotMatch',
      status: 403,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Expired credentials
   */
  static expiredCredentials(requestId?: string): AuthError {
    return new AuthError({
      message: 'The provided credentials have expired',
      code: 'ExpiredToken',
      status: 403,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Access denied
   */
  static accessDenied(resource?: string, requestId?: string): AuthError {
    return new AuthError({
      message: resource ? `Access denied to resource: ${resource}` : 'Access denied',
      code: 'AccessDenied',
      status: 403,
      isRetryable: false,
      requestId,
      details: resource ? { resource } : undefined,
    });
  }

  /**
   * Invalid security token
   */
  static invalidToken(requestId?: string): AuthError {
    return new AuthError({
      message: 'The provided security token is invalid',
      code: 'InvalidToken',
      status: 403,
      isRetryable: false,
      requestId,
    });
  }
}

/**
 * Bucket-related errors
 */
export class BucketError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'bucket_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'BucketError';
    Object.setPrototypeOf(this, BucketError.prototype);
  }

  /**
   * Bucket not found
   */
  static notFound(bucket: string, requestId?: string): BucketError {
    return new BucketError({
      message: `The specified bucket does not exist: ${bucket}`,
      code: 'NoSuchBucket',
      status: 404,
      isRetryable: false,
      requestId,
      details: { bucket },
    });
  }

  /**
   * Bucket access denied
   */
  static accessDenied(bucket: string, requestId?: string): BucketError {
    return new BucketError({
      message: `Access denied to bucket: ${bucket}`,
      code: 'AllAccessDisabled',
      status: 403,
      isRetryable: false,
      requestId,
      details: { bucket },
    });
  }

  /**
   * Bucket already exists (owned by you)
   */
  static alreadyExists(bucket: string, requestId?: string): BucketError {
    return new BucketError({
      message: `Bucket already exists: ${bucket}`,
      code: 'BucketAlreadyOwnedByYou',
      status: 409,
      isRetryable: false,
      requestId,
      details: { bucket },
    });
  }

  /**
   * Bucket name not available
   */
  static nameNotAvailable(bucket: string, requestId?: string): BucketError {
    return new BucketError({
      message: `Bucket name already exists: ${bucket}`,
      code: 'BucketAlreadyExists',
      status: 409,
      isRetryable: false,
      requestId,
      details: { bucket },
    });
  }
}

/**
 * Object-related errors
 */
export class ObjectError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'object_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'ObjectError';
    Object.setPrototypeOf(this, ObjectError.prototype);
  }

  /**
   * Object not found
   */
  static notFound(key: string, requestId?: string): ObjectError {
    return new ObjectError({
      message: `The specified object does not exist: ${key}`,
      code: 'NoSuchKey',
      status: 404,
      isRetryable: false,
      requestId,
      details: { key },
    });
  }

  /**
   * Precondition failed (if-match, if-none-match, etc.)
   */
  static preconditionFailed(message?: string, requestId?: string): ObjectError {
    return new ObjectError({
      message: message ?? 'At least one of the preconditions you specified did not hold',
      code: 'PreconditionFailed',
      status: 412,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Not modified (304)
   */
  static notModified(requestId?: string): ObjectError {
    return new ObjectError({
      message: 'The object has not been modified',
      code: 'NotModified',
      status: 304,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Entity too large
   */
  static entityTooLarge(maxSize?: number, requestId?: string): ObjectError {
    return new ObjectError({
      message: maxSize
        ? `Your proposed upload exceeds the maximum allowed size: ${maxSize} bytes`
        : 'Your proposed upload exceeds the maximum allowed size',
      code: 'EntityTooLarge',
      status: 413,
      isRetryable: false,
      requestId,
      details: maxSize ? { maxSize } : undefined,
    });
  }

  /**
   * Invalid object state
   */
  static invalidObjectState(state: string, requestId?: string): ObjectError {
    return new ObjectError({
      message: `The operation is not valid for the object's current state: ${state}`,
      code: 'InvalidObjectState',
      status: 403,
      isRetryable: false,
      requestId,
      details: { state },
    });
  }

  /**
   * Object is locked
   */
  static objectLocked(key: string, requestId?: string): ObjectError {
    return new ObjectError({
      message: `The object is locked: ${key}`,
      code: 'ObjectLocked',
      status: 403,
      isRetryable: false,
      requestId,
      details: { key },
    });
  }

  /**
   * Invalid part (for range requests)
   */
  static invalidRange(range: string, requestId?: string): ObjectError {
    return new ObjectError({
      message: `The requested range is not satisfiable: ${range}`,
      code: 'InvalidRange',
      status: 416,
      isRetryable: false,
      requestId,
      details: { range },
    });
  }
}

/**
 * Multipart upload errors
 */
export class MultipartError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'multipart_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'MultipartError';
    Object.setPrototypeOf(this, MultipartError.prototype);
  }

  /**
   * Multipart upload not found
   */
  static uploadNotFound(uploadId: string, requestId?: string): MultipartError {
    return new MultipartError({
      message: `The specified multipart upload does not exist: ${uploadId}`,
      code: 'NoSuchUpload',
      status: 404,
      isRetryable: false,
      requestId,
      details: { uploadId },
    });
  }

  /**
   * Invalid part
   */
  static invalidPart(partNumber: number, requestId?: string): MultipartError {
    return new MultipartError({
      message: `One or more of the specified parts could not be found. Part: ${partNumber}`,
      code: 'InvalidPart',
      status: 400,
      isRetryable: false,
      requestId,
      details: { partNumber },
    });
  }

  /**
   * Invalid part order
   */
  static invalidPartOrder(requestId?: string): MultipartError {
    return new MultipartError({
      message: 'The list of parts was not in ascending order. Parts must be ordered by part number.',
      code: 'InvalidPartOrder',
      status: 400,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Entity too small (part size < 5MB except last part)
   */
  static entityTooSmall(partNumber: number, size: number, requestId?: string): MultipartError {
    return new MultipartError({
      message: `Part ${partNumber} is too small (${size} bytes). Parts must be at least 5MB except the last part.`,
      code: 'EntityTooSmall',
      status: 400,
      isRetryable: false,
      requestId,
      details: { partNumber, size },
    });
  }

  /**
   * Too many parts
   */
  static tooManyParts(requestId?: string): MultipartError {
    return new MultipartError({
      message: 'You have attempted to upload more than the maximum allowed parts (10,000)',
      code: 'TooManyParts',
      status: 400,
      isRetryable: false,
      requestId,
    });
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'network_error',
      isRetryable: params.isRetryable ?? true,
    });
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  /**
   * Connection failed
   */
  static connectionFailed(message?: string): NetworkError {
    return new NetworkError({
      message: message ?? 'Failed to establish connection to R2',
      code: 'CONNECTION_FAILED',
      isRetryable: true,
    });
  }

  /**
   * Request timeout
   */
  static timeout(timeoutMs: number): NetworkError {
    return new NetworkError({
      message: `Request timed out after ${timeoutMs}ms`,
      code: 'REQUEST_TIMEOUT',
      status: 408,
      isRetryable: true,
      details: { timeoutMs },
    });
  }

  /**
   * TLS/SSL error
   */
  static tlsError(message: string): NetworkError {
    return new NetworkError({
      message: `TLS/SSL error: ${message}`,
      code: 'TLS_ERROR',
      isRetryable: false,
    });
  }

  /**
   * DNS resolution failed
   */
  static dnsError(hostname: string): NetworkError {
    return new NetworkError({
      message: `Failed to resolve DNS for hostname: ${hostname}`,
      code: 'DNS_ERROR',
      isRetryable: true,
      details: { hostname },
    });
  }

  /**
   * Connection reset
   */
  static connectionReset(): NetworkError {
    return new NetworkError({
      message: 'Connection was reset by the peer',
      code: 'CONNECTION_RESET',
      isRetryable: true,
    });
  }
}

/**
 * Server-side errors from R2
 */
export class ServerError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'server_error',
      isRetryable: params.isRetryable ?? true,
    });
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }

  /**
   * Internal server error (500)
   */
  static internalError(requestId?: string): ServerError {
    return new ServerError({
      message: 'We encountered an internal error. Please try again.',
      code: 'InternalError',
      status: 500,
      isRetryable: true,
      requestId,
    });
  }

  /**
   * Service unavailable (503)
   */
  static serviceUnavailable(retryAfter?: number, requestId?: string): ServerError {
    return new ServerError({
      message: 'The service is temporarily unavailable. Please try again later.',
      code: 'ServiceUnavailable',
      status: 503,
      isRetryable: true,
      requestId,
      retryAfter,
    });
  }

  /**
   * Slow down (503 with specific code)
   */
  static slowDown(retryAfter?: number, requestId?: string): ServerError {
    return new ServerError({
      message: 'Please reduce your request rate.',
      code: 'SlowDown',
      status: 503,
      isRetryable: true,
      requestId,
      retryAfter,
    });
  }

  /**
   * Bad gateway (502)
   */
  static badGateway(requestId?: string): ServerError {
    return new ServerError({
      message: 'Bad gateway error',
      code: 'BadGateway',
      status: 502,
      isRetryable: true,
      requestId,
    });
  }

  /**
   * Gateway timeout (504)
   */
  static gatewayTimeout(requestId?: string): ServerError {
    return new ServerError({
      message: 'Gateway timeout error',
      code: 'GatewayTimeout',
      status: 504,
      isRetryable: true,
      requestId,
    });
  }
}

/**
 * Data transfer and integrity errors
 */
export class TransferError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'transfer_error',
      isRetryable: params.isRetryable ?? true,
    });
    this.name = 'TransferError';
    Object.setPrototypeOf(this, TransferError.prototype);
  }

  /**
   * Stream interrupted during transfer
   */
  static streamInterrupted(bytesTransferred?: number): TransferError {
    return new TransferError({
      message: bytesTransferred
        ? `Stream was interrupted after transferring ${bytesTransferred} bytes`
        : 'Stream was interrupted during transfer',
      code: 'STREAM_INTERRUPTED',
      isRetryable: true,
      details: bytesTransferred ? { bytesTransferred } : undefined,
    });
  }

  /**
   * Checksum mismatch
   */
  static checksumMismatch(expected?: string, actual?: string, requestId?: string): TransferError {
    return new TransferError({
      message: 'The calculated checksum does not match the provided checksum',
      code: 'BadDigest',
      status: 400,
      isRetryable: false,
      requestId,
      details:
        expected && actual
          ? {
              expected,
              actual,
            }
          : undefined,
    });
  }

  /**
   * Incomplete body
   */
  static incompleteBody(expectedSize: number, actualSize: number, requestId?: string): TransferError {
    return new TransferError({
      message: `Request body incomplete. Expected ${expectedSize} bytes, got ${actualSize} bytes.`,
      code: 'IncompleteBody',
      status: 400,
      isRetryable: true,
      requestId,
      details: {
        expectedSize,
        actualSize,
      },
    });
  }

  /**
   * Invalid digest
   */
  static invalidDigest(requestId?: string): TransferError {
    return new TransferError({
      message: 'The Content-MD5 you specified was invalid',
      code: 'InvalidDigest',
      status: 400,
      isRetryable: false,
      requestId,
    });
  }

  /**
   * Request entity too large
   */
  static requestEntityTooLarge(requestId?: string): TransferError {
    return new TransferError({
      message: 'Your request entity size exceeds the maximum allowed',
      code: 'RequestEntityTooLarge',
      status: 413,
      isRetryable: false,
      requestId,
    });
  }
}

/**
 * Request validation errors
 */
export class ValidationError extends R2Error {
  constructor(params: Omit<R2ErrorParams, 'type'>) {
    super({
      ...params,
      type: 'validation_error',
      isRetryable: params.isRetryable ?? false,
    });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Invalid parameter value
   */
  static invalidParameter(paramName: string, message?: string): ValidationError {
    return new ValidationError({
      message: message ?? `Invalid parameter: ${paramName}`,
      code: 'InvalidParameter',
      status: 400,
      isRetryable: false,
      details: { paramName },
    });
  }

  /**
   * Missing required parameter
   */
  static missingParameter(paramName: string): ValidationError {
    return new ValidationError({
      message: `Missing required parameter: ${paramName}`,
      code: 'MissingParameter',
      status: 400,
      isRetryable: false,
      details: { paramName },
    });
  }

  /**
   * Invalid bucket name
   */
  static invalidBucketName(bucketName: string): ValidationError {
    return new ValidationError({
      message: `Invalid bucket name: ${bucketName}`,
      code: 'InvalidBucketName',
      status: 400,
      isRetryable: false,
      details: { bucketName },
    });
  }

  /**
   * Invalid object key
   */
  static invalidKey(key: string): ValidationError {
    return new ValidationError({
      message: `Invalid object key: ${key}`,
      code: 'InvalidKey',
      status: 400,
      isRetryable: false,
      details: { key },
    });
  }

  /**
   * Malformed XML
   */
  static malformedXml(requestId?: string): ValidationError {
    return new ValidationError({
      message: 'The XML you provided was not well-formed or did not validate against our published schema',
      code: 'MalformedXML',
      status: 400,
      isRetryable: false,
      requestId,
    });
  }
}
