/**
 * Error handling for Qdrant integration.
 * Provides a comprehensive error hierarchy for all Qdrant operations.
 *
 * @module errors
 */

/**
 * Base error class for all Qdrant errors.
 * Provides structured error information including error type, HTTP status,
 * retry capabilities, and optional retry-after information.
 */
export class QdrantError extends Error {
  /**
   * The type of error (e.g., 'configuration_error', 'authentication_error')
   */
  public readonly type: string;

  /**
   * HTTP status code associated with the error, if applicable
   */
  public readonly status?: number;

  /**
   * Number of seconds to wait before retrying, if provided by the API
   */
  public readonly retryAfter?: number;

  /**
   * Indicates whether this error type can be retried
   */
  public readonly isRetryable: boolean;

  /**
   * Additional error details from the API response
   */
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    type: string;
    message: string;
    status?: number;
    retryAfter?: number;
    isRetryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'QdrantError';
    this.type = options.type;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.isRetryable = options.isRetryable ?? false;
    this.details = options.details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      status: this.status,
      retryAfter: this.retryAfter,
      isRetryable: this.isRetryable,
      details: this.details,
    };
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Base class for configuration-related errors.
 * These errors occur when the client is misconfigured.
 */
export class ConfigurationError extends QdrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'configuration_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when an invalid URL is provided.
 */
export class InvalidUrlError extends ConfigurationError {
  constructor(url: string, details?: Record<string, unknown>) {
    super(`Invalid Qdrant URL: ${url}`, { ...details, url });
    this.name = 'InvalidUrlError';
  }
}

/**
 * Error thrown when an invalid API key is provided during configuration.
 */
export class InvalidApiKeyConfigError extends ConfigurationError {
  constructor(message = 'Invalid API key format', details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'InvalidApiKeyConfigError';
  }
}

/**
 * Error thrown when required configuration is missing.
 */
export class MissingConfigurationError extends ConfigurationError {
  constructor(field: string, details?: Record<string, unknown>) {
    super(`Missing required configuration: ${field}`, { ...details, field });
    this.name = 'MissingConfigurationError';
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

/**
 * Base class for connection-related errors.
 * These errors occur when network connectivity fails.
 */
export class ConnectionError extends QdrantError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super({
      type: 'connection_error',
      message,
      isRetryable: true,
      details: { ...details, cause: cause?.message },
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when connection to Qdrant fails.
 */
export class ConnectionFailedError extends ConnectionError {
  constructor(url: string, cause?: Error, details?: Record<string, unknown>) {
    super(`Failed to connect to Qdrant at ${url}`, cause, { ...details, url });
    this.name = 'ConnectionFailedError';
  }
}

/**
 * Error thrown when a connection attempt times out.
 */
export class ConnectionTimeoutError extends ConnectionError {
  constructor(timeout: number, details?: Record<string, unknown>) {
    super(`Connection timeout after ${timeout}ms`, undefined, { ...details, timeout });
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * Error thrown when TLS/SSL handshake fails.
 */
export class TlsError extends ConnectionError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super(`TLS error: ${message}`, cause, details);
    this.name = 'TlsError';
  }
}

/**
 * Error thrown when DNS resolution fails.
 */
export class DnsResolutionFailedError extends ConnectionError {
  constructor(hostname: string, cause?: Error, details?: Record<string, unknown>) {
    super(`DNS resolution failed for ${hostname}`, cause, { ...details, hostname });
    this.name = 'DnsResolutionFailedError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Base class for authentication-related errors.
 * These errors occur when API key validation fails.
 */
export class AuthenticationError extends QdrantError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'authentication_error',
      message,
      status: status ?? 401,
      isRetryable: false,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when an invalid API key is used for authentication.
 */
export class InvalidApiKeyError extends AuthenticationError {
  constructor(message = 'Invalid API key', details?: Record<string, unknown>) {
    super(message, 401, details);
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * Error thrown when an API key has expired.
 */
export class ApiKeyExpiredError extends AuthenticationError {
  constructor(details?: Record<string, unknown>) {
    super('API key has expired', 401, details);
    this.name = 'ApiKeyExpiredError';
  }
}

/**
 * Error thrown when permission is denied for a requested operation.
 */
export class PermissionDeniedError extends AuthenticationError {
  constructor(resource: string, operation: string, details?: Record<string, unknown>) {
    super(`Permission denied for ${operation} on ${resource}`, 403, {
      ...details,
      resource,
      operation
    });
    this.name = 'PermissionDeniedError';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Error thrown when request validation fails.
 * This typically indicates invalid parameters or malformed requests.
 */
export class ValidationError extends QdrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'validation_error',
      message,
      status: 400,
      isRetryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Collection Errors
// ============================================================================

/**
 * Base class for collection-related errors.
 * These errors occur during collection operations.
 */
export class CollectionError extends QdrantError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'collection_error',
      message,
      status,
      isRetryable: false,
      details,
    });
    this.name = 'CollectionError';
  }
}

/**
 * Error thrown when a requested collection is not found.
 */
export class CollectionNotFoundError extends CollectionError {
  constructor(collectionName: string, details?: Record<string, unknown>) {
    super(`Collection not found: ${collectionName}`, 404, { ...details, collectionName });
    this.name = 'CollectionNotFoundError';
  }
}

/**
 * Error thrown when attempting to create a collection that already exists.
 */
export class CollectionAlreadyExistsError extends CollectionError {
  constructor(collectionName: string, details?: Record<string, unknown>) {
    super(`Collection already exists: ${collectionName}`, 409, { ...details, collectionName });
    this.name = 'CollectionAlreadyExistsError';
  }
}

/**
 * Error thrown when vector configuration is invalid.
 */
export class InvalidVectorConfigError extends CollectionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Invalid vector configuration: ${message}`, 400, details);
    this.name = 'InvalidVectorConfigError';
  }
}

/**
 * Error thrown when attempting to modify a locked collection.
 */
export class CollectionLockedError extends CollectionError {
  constructor(collectionName: string, details?: Record<string, unknown>) {
    super(`Collection is locked: ${collectionName}`, 423, { ...details, collectionName });
    this.name = 'CollectionLockedError';
  }
}

// ============================================================================
// Point Errors
// ============================================================================

/**
 * Base class for point-related errors.
 * These errors occur during point operations.
 */
export class PointError extends QdrantError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'point_error',
      message,
      status,
      isRetryable: false,
      details,
    });
    this.name = 'PointError';
  }
}

/**
 * Error thrown when a requested point is not found.
 */
export class PointNotFoundError extends PointError {
  constructor(pointId: string | number, details?: Record<string, unknown>) {
    super(`Point not found: ${pointId}`, 404, { ...details, pointId });
    this.name = 'PointNotFoundError';
  }
}

/**
 * Error thrown when a point ID is invalid.
 */
export class InvalidPointIdError extends PointError {
  constructor(pointId: unknown, details?: Record<string, unknown>) {
    super(`Invalid point ID: ${pointId}`, 400, { ...details, pointId });
    this.name = 'InvalidPointIdError';
  }
}

/**
 * Error thrown when a vector is invalid.
 */
export class InvalidVectorError extends PointError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Invalid vector: ${message}`, 400, details);
    this.name = 'InvalidVectorError';
  }
}

/**
 * Error thrown when vector dimensions don't match collection configuration.
 */
export class VectorDimensionMismatchError extends PointError {
  constructor(expected: number, actual: number, details?: Record<string, unknown>) {
    super(
      `Vector dimension mismatch: expected ${expected}, got ${actual}`,
      400,
      { ...details, expected, actual }
    );
    this.name = 'VectorDimensionMismatchError';
  }
}

/**
 * Error thrown when a point payload is too large.
 */
export class PayloadTooLargeError extends PointError {
  constructor(size: number, maxSize: number, details?: Record<string, unknown>) {
    super(
      `Payload too large: ${size} bytes exceeds maximum of ${maxSize} bytes`,
      413,
      { ...details, size, maxSize }
    );
    this.name = 'PayloadTooLargeError';
  }
}

// ============================================================================
// Search Errors
// ============================================================================

/**
 * Base class for search-related errors.
 * These errors occur during search operations.
 */
export class SearchError extends QdrantError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'search_error',
      message,
      status,
      isRetryable: false,
      details,
    });
    this.name = 'SearchError';
  }
}

/**
 * Error thrown when a search filter is invalid.
 */
export class InvalidFilterError extends SearchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Invalid filter: ${message}`, 400, details);
    this.name = 'InvalidFilterError';
  }
}

/**
 * Error thrown when a search vector is invalid.
 */
export class InvalidSearchVectorError extends SearchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Invalid search vector: ${message}`, 400, details);
    this.name = 'InvalidSearchVectorError';
  }
}

/**
 * Error thrown when a search operation times out.
 */
export class SearchTimeoutError extends SearchError {
  constructor(timeout: number, details?: Record<string, unknown>) {
    super(`Search timeout after ${timeout}ms`, 408, { ...details, timeout });
    this.name = 'SearchTimeoutError';
  }
}

// ============================================================================
// Service Errors
// ============================================================================

/**
 * Base class for service-level errors.
 * These errors occur at the Qdrant service level.
 */
export class ServiceError extends QdrantError {
  constructor(message: string, status?: number, retryable = true, details?: Record<string, unknown>) {
    super({
      type: 'service_error',
      message,
      status,
      isRetryable: retryable,
      details,
    });
    this.name = 'ServiceError';
  }
}

/**
 * Error thrown when rate limits are exceeded.
 */
export class RateLimitedError extends QdrantError {
  constructor(retryAfter?: number, details?: Record<string, unknown>) {
    super({
      type: 'service_error',
      message: 'Rate limit exceeded',
      status: 429,
      retryAfter,
      isRetryable: true,
      details,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Error thrown when the Qdrant service is unavailable.
 */
export class ServiceUnavailableError extends QdrantError {
  constructor(retryAfter?: number, details?: Record<string, unknown>) {
    super({
      type: 'service_error',
      message: 'Qdrant service is unavailable',
      status: 503,
      retryAfter,
      isRetryable: true,
      details,
    });
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error thrown when an internal server error occurs.
 */
export class InternalError extends ServiceError {
  constructor(message = 'Internal server error', details?: Record<string, unknown>) {
    super(message, 500, true, details);
    this.name = 'InternalError';
  }
}

/**
 * Error thrown when storage is full.
 */
export class StorageFullError extends ServiceError {
  constructor(details?: Record<string, unknown>) {
    super('Storage is full', 507, false, details);
    this.name = 'StorageFullError';
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutError extends QdrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'timeout_error',
      message,
      status: 408,
      isRetryable: true,
      details,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerError extends QdrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'circuit_breaker_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Creates an appropriate error instance from an HTTP response.
 * @param status - HTTP status code.
 * @param message - Error message.
 * @param details - Optional additional error details.
 * @returns An appropriate QdrantError subclass instance.
 */
export function createErrorFromResponse(
  status: number,
  message: string,
  details?: Record<string, unknown>
): QdrantError {
  switch (status) {
    case 400:
      return new ValidationError(message, details);
    case 401:
      return new InvalidApiKeyError(message, details);
    case 403:
      return new PermissionDeniedError('unknown', 'unknown', details);
    case 404:
      return new CollectionNotFoundError('unknown', details);
    case 408:
      return new TimeoutError(message, details);
    case 409:
      return new CollectionAlreadyExistsError('unknown', details);
    case 413:
      return new PayloadTooLargeError(0, 0, details);
    case 423:
      return new CollectionLockedError('unknown', details);
    case 429: {
      const retryAfter = details?.retryAfter as number | undefined;
      return new RateLimitedError(retryAfter, details);
    }
    case 500:
      return new InternalError(message, details);
    case 503: {
      const retryAfter = details?.retryAfter as number | undefined;
      return new ServiceUnavailableError(retryAfter, details);
    }
    case 507:
      return new StorageFullError(details);
    default:
      if (status >= 500 && status < 600) {
        return new InternalError(message, details);
      }
      // For any other status codes, return a generic QdrantError
      return new QdrantError({
        type: 'unknown_error',
        message: message || `HTTP error ${status}`,
        status,
        isRetryable: false,
        details,
      });
  }
}

/**
 * Type guard to check if an error is a QdrantError.
 * @param error - The error to check.
 * @returns True if the error is a QdrantError, false otherwise.
 */
export function isQdrantError(error: unknown): error is QdrantError {
  return error instanceof QdrantError;
}

/**
 * Type guard to check if an error is retryable.
 * @param error - The error to check.
 * @returns True if the error is retryable, false otherwise.
 */
export function isRetryableError(error: unknown): boolean {
  if (isQdrantError(error)) {
    return error.isRetryable;
  }
  return false;
}
