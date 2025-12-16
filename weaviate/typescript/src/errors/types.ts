import { WeaviateError } from './base.js';

/**
 * Error thrown when the client is misconfigured (e.g., missing endpoint, invalid configuration)
 * This error is not retryable as it requires configuration changes.
 */
export class ConfigurationError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'configuration',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when authentication fails (e.g., invalid API key, missing credentials)
 * HTTP 401 - Not retryable as credentials need to be fixed.
 */
export class AuthenticationError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'authentication',
      message,
      statusCode: 401,
      isRetryable: false,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Alias for AuthenticationError for consistency with HTTP 401 terminology
 */
export class UnauthorizedError extends AuthenticationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when authorization fails (e.g., insufficient permissions)
 * HTTP 403 - Not retryable as permissions need to be granted.
 */
export class ForbiddenError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'authentication',
      message,
      statusCode: 403,
      isRetryable: false,
      details,
    });
    this.name = 'ForbiddenError';
  }
}

/**
 * Error thrown when a requested object is not found
 * HTTP 404 - Not retryable as the object doesn't exist.
 */
export class ObjectNotFoundError extends WeaviateError {
  constructor(
    objectId: string,
    className?: string,
    details?: Record<string, unknown>
  ) {
    const message = className
      ? `Object '${objectId}' not found in class '${className}'`
      : `Object '${objectId}' not found`;
    super({
      category: 'not_found',
      message,
      statusCode: 404,
      isRetryable: false,
      details: { ...details, objectId, className },
    });
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Error thrown when a requested class is not found
 * HTTP 404 - Not retryable as the class doesn't exist.
 */
export class ClassNotFoundError extends WeaviateError {
  constructor(className: string, details?: Record<string, unknown>) {
    super({
      category: 'not_found',
      message: `Class '${className}' not found`,
      statusCode: 404,
      isRetryable: false,
      details: { ...details, className },
    });
    this.name = 'ClassNotFoundError';
  }
}

/**
 * Error thrown when a requested tenant is not found
 * HTTP 404 - Not retryable as the tenant doesn't exist.
 */
export class TenantNotFoundError extends WeaviateError {
  constructor(
    tenantName: string,
    className?: string,
    details?: Record<string, unknown>
  ) {
    const message = className
      ? `Tenant '${tenantName}' not found in class '${className}'`
      : `Tenant '${tenantName}' not found`;
    super({
      category: 'tenant',
      message,
      statusCode: 404,
      isRetryable: false,
      details: { ...details, tenantName, className },
    });
    this.name = 'TenantNotFoundError';
  }
}

/**
 * Error thrown when tenant is not in active state
 * The tenant exists but is inactive or offloaded.
 */
export class TenantNotActiveError extends WeaviateError {
  constructor(
    tenantName: string,
    status: string,
    className?: string,
    details?: Record<string, unknown>
  ) {
    const message = className
      ? `Tenant '${tenantName}' in class '${className}' is not active (status: ${status})`
      : `Tenant '${tenantName}' is not active (status: ${status})`;
    super({
      category: 'tenant',
      message,
      statusCode: 422,
      isRetryable: false,
      details: { ...details, tenantName, className, status },
    });
    this.name = 'TenantNotActiveError';
  }
}

/**
 * Error thrown when object validation fails
 * HTTP 422 - Not retryable as the object data is invalid.
 */
export class InvalidObjectError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'validation',
      message,
      statusCode: 422,
      isRetryable: false,
      details,
    });
    this.name = 'InvalidObjectError';
  }
}

/**
 * Error thrown when filter validation fails
 * HTTP 422 - Not retryable as the filter syntax/semantics are incorrect.
 */
export class InvalidFilterError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'validation',
      message,
      statusCode: 422,
      isRetryable: false,
      details,
    });
    this.name = 'InvalidFilterError';
  }
}

/**
 * Error thrown when vector validation fails (e.g., dimension mismatch)
 * HTTP 422 - Not retryable as the vector is invalid.
 */
export class InvalidVectorError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'validation',
      message,
      statusCode: 422,
      isRetryable: false,
      details,
    });
    this.name = 'InvalidVectorError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 * HTTP 429 - Retryable after waiting for the retry-after period.
 */
export class RateLimitedError extends WeaviateError {
  constructor(
    message: string,
    retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super({
      category: 'rate_limit',
      message,
      statusCode: 429,
      isRetryable: true,
      retryAfter,
      details,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Error thrown when Weaviate service is unavailable
 * HTTP 503 - Retryable as the service may come back online.
 */
export class ServiceUnavailableError extends WeaviateError {
  constructor(
    message: string,
    retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super({
      category: 'server',
      message,
      statusCode: 503,
      isRetryable: true,
      retryAfter,
      details,
    });
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error thrown when Weaviate returns an internal server error
 * HTTP 500 - Retryable as it may be a transient issue.
 */
export class InternalError extends WeaviateError {
  constructor(
    message: string,
    statusCode?: number,
    details?: Record<string, unknown>
  ) {
    super({
      category: 'internal',
      message,
      statusCode: statusCode ?? 500,
      isRetryable: true,
      details,
    });
    this.name = 'InternalError';
  }
}

/**
 * Error thrown when a request times out
 * Retryable as it may succeed on retry.
 */
export class TimeoutError extends WeaviateError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      category: 'network',
      message,
      isRetryable: true,
      details,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when connection to Weaviate fails
 * Retryable as the connection may be restored.
 */
export class ConnectionError extends WeaviateError {
  constructor(
    message: string,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super({
      category: 'network',
      message,
      isRetryable: true,
      cause,
      details,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Alias for ConnectionError for compatibility
 */
export class NetworkError extends ConnectionError {
  constructor(
    message: string,
    options?: { cause?: Error; details?: Record<string, unknown> }
  ) {
    super(message, options?.cause, options?.details);
    this.name = 'NetworkError';
  }
}

/**
 * Represents an individual batch operation error
 */
export interface BatchErrorDetail {
  /** Index of the failed object in the batch */
  index: number;
  /** Object ID if available */
  objectId?: string;
  /** Error message for this specific object */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Error thrown when a batch operation partially fails
 * HTTP 207 Multi-Status - Some items succeeded, some failed.
 * This is partially retryable - only the failed items should be retried.
 */
export class BatchPartialFailureError extends WeaviateError {
  /** Number of successful operations */
  public readonly successful: number;
  /** Number of failed operations */
  public readonly failed: number;
  /** Details of each failed operation */
  public readonly errors: BatchErrorDetail[];

  constructor(
    successful: number,
    failed: number,
    errors: BatchErrorDetail[],
    details?: Record<string, unknown>
  ) {
    const message = `Batch operation partially failed: ${successful} succeeded, ${failed} failed`;
    super({
      category: 'batch',
      message,
      statusCode: 207,
      isRetryable: true, // Failed items can be retried
      details: {
        ...details,
        successful,
        failed,
        errors,
      },
    });
    this.name = 'BatchPartialFailureError';
    this.successful = successful;
    this.failed = failed;
    this.errors = errors;
  }

  /**
   * Get indices of failed operations that can be retried
   */
  getFailedIndices(): number[] {
    return this.errors.map((e) => e.index);
  }
}

/**
 * Represents a GraphQL error from Weaviate's GraphQL API
 */
export interface GraphQLErrorDetail {
  /** GraphQL error message */
  message: string;
  /** Path to the field that caused the error */
  path?: (string | number)[];
  /** Error locations in the query */
  locations?: Array<{ line: number; column: number }>;
  /** Additional error extensions */
  extensions?: Record<string, unknown>;
}

/**
 * Error thrown when a GraphQL query fails
 * Can contain multiple errors from the GraphQL response.
 */
export class GraphQLError extends WeaviateError {
  /** Array of GraphQL errors */
  public readonly errors: GraphQLErrorDetail[];

  constructor(errors: GraphQLErrorDetail[], details?: Record<string, unknown>) {
    const message =
      errors.length === 1
        ? `GraphQL error: ${errors[0].message}`
        : `GraphQL errors: ${errors.map((e) => e.message).join('; ')}`;

    super({
      category: 'graphql',
      message,
      isRetryable: false, // GraphQL errors are typically not retryable
      details: {
        ...details,
        errors,
      },
    });
    this.name = 'GraphQLError';
    this.errors = errors;
  }

  /**
   * Check if any error contains a specific message
   */
  hasErrorMessage(search: string): boolean {
    return this.errors.some((e) => e.message.includes(search));
  }

  /**
   * Get the first error message
   */
  getFirstErrorMessage(): string {
    return this.errors[0]?.message ?? 'Unknown GraphQL error';
  }
}

/**
 * Type guard to check if an error is a ConfigurationError
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

/**
 * Type guard to check if an error is an AuthenticationError
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is a batch error
 */
export function isBatchPartialFailureError(
  error: unknown
): error is BatchPartialFailureError {
  return error instanceof BatchPartialFailureError;
}

/**
 * Type guard to check if an error is a GraphQL error
 */
export function isGraphQLError(error: unknown): error is GraphQLError {
  return error instanceof GraphQLError;
}

/**
 * Type guard to check if an error is a not found error
 */
export function isNotFoundError(
  error: unknown
): error is ObjectNotFoundError | ClassNotFoundError | TenantNotFoundError {
  return (
    error instanceof ObjectNotFoundError ||
    error instanceof ClassNotFoundError ||
    error instanceof TenantNotFoundError
  );
}

/**
 * Type guard to check if an error is a validation error
 */
export function isValidationError(
  error: unknown
): error is InvalidObjectError | InvalidFilterError | InvalidVectorError {
  return (
    error instanceof InvalidObjectError ||
    error instanceof InvalidFilterError ||
    error instanceof InvalidVectorError
  );
}

/**
 * Type guard to check if an error is a network error
 */
export function isNetworkError(
  error: unknown
): error is TimeoutError | ConnectionError {
  return error instanceof TimeoutError || error instanceof ConnectionError;
}
