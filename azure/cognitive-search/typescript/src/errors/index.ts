/**
 * Azure Cognitive Search Error Types
 *
 * Comprehensive error hierarchy following SPARC specification.
 * Errors are categorized by type with proper retryability information.
 */

/** Base error options */
export interface AcsErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  requestId?: string;
  index?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: Error;
}

/**
 * Base class for all Azure Cognitive Search errors
 */
export abstract class AcsError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly requestId?: string;
  public readonly index?: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public override readonly cause?: Error;

  constructor(options: AcsErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.requestId = options.requestId;
    this.index = options.index;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;

    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      requestId: this.requestId,
      index: this.index,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigurationError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false, code: 'configuration_error' });
  }
}

/**
 * Invalid endpoint configuration
 */
export class InvalidEndpointError extends ConfigurationError {
  constructor(endpoint: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Invalid endpoint: ${endpoint}`,
      ...options,
      code: 'invalid_endpoint',
    });
  }
}

/**
 * Invalid index name configuration
 */
export class InvalidIndexNameError extends ConfigurationError {
  constructor(indexName: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Invalid index name: ${indexName}`,
      ...options,
      code: 'invalid_index_name',
      index: indexName,
    });
  }
}

/**
 * Missing credentials configuration
 */
export class MissingCredentialsError extends ConfigurationError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Missing credentials: API key or Azure AD credentials required',
      ...options,
      code: 'missing_credentials',
    });
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Authentication error - failed to authenticate
 */
export class AuthenticationError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false, statusCode: options.statusCode ?? 401 });
  }
}

/**
 * Invalid API key error
 */
export class InvalidApiKeyError extends AuthenticationError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Invalid API key',
      ...options,
      code: 'invalid_api_key',
    });
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Authentication token expired',
      ...options,
      code: 'token_expired',
    });
  }
}

/**
 * Permission denied error (403)
 */
export class PermissionDeniedError extends AuthenticationError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Permission denied',
      ...options,
      statusCode: 403,
      code: 'permission_denied',
    });
  }
}

// ============================================================================
// Index Errors
// ============================================================================

/**
 * Index error - issues with index operations
 */
export class IndexError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false });
  }
}

/**
 * Index not found error (404)
 */
export class IndexNotFoundError extends IndexError {
  constructor(indexName: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Index not found: ${indexName}`,
      ...options,
      statusCode: 404,
      code: 'index_not_found',
      index: indexName,
    });
  }
}

/**
 * Field not found error
 */
export class FieldNotFoundError extends IndexError {
  public readonly fieldName: string;

  constructor(indexName: string, fieldName: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Field not found in index ${indexName}: ${fieldName}`,
      ...options,
      code: 'field_not_found',
      index: indexName,
    });
    this.fieldName = fieldName;
  }
}

/**
 * Invalid schema error
 */
export class InvalidSchemaError extends IndexError {
  constructor(indexName: string, reason: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Invalid schema for index ${indexName}: ${reason}`,
      ...options,
      code: 'invalid_schema',
      index: indexName,
    });
  }
}

// ============================================================================
// Document Errors
// ============================================================================

/**
 * Document error - issues with document operations
 */
export class DocumentError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false });
  }
}

/**
 * Document not found error
 */
export class DocumentNotFoundError extends DocumentError {
  public readonly documentKey: string;

  constructor(indexName: string, documentKey: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Document not found in index ${indexName}: ${documentKey}`,
      ...options,
      statusCode: 404,
      code: 'document_not_found',
      index: indexName,
    });
    this.documentKey = documentKey;
  }
}

/**
 * Key field missing error
 */
export class KeyFieldMissingError extends DocumentError {
  constructor(indexName: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Key field missing in document for index ${indexName}`,
      ...options,
      statusCode: 400,
      code: 'key_field_missing',
      index: indexName,
    });
  }
}

/**
 * Validation failed error
 */
export class ValidationFailedError extends DocumentError {
  public readonly reason: string;

  constructor(indexName: string, reason: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Validation failed for index ${indexName}: ${reason}`,
      ...options,
      statusCode: 400,
      code: 'validation_failed',
      index: indexName,
    });
    this.reason = reason;
  }
}

/**
 * Partial failure error (207 status)
 */
export class PartialFailureError extends AcsError {
  public readonly successCount: number;
  public readonly failureCount: number;
  public readonly failedKeys: string[];

  constructor(
    indexName: string,
    successCount: number,
    failureCount: number,
    failedKeys: string[],
    options?: Partial<AcsErrorOptions>
  ) {
    super({
      message: `Partial failure in index ${indexName}: ${successCount} succeeded, ${failureCount} failed`,
      ...options,
      statusCode: 207,
      code: 'partial_failure',
      index: indexName,
      retryable: true,
    });
    this.successCount = successCount;
    this.failureCount = failureCount;
    this.failedKeys = failedKeys;
  }
}

// ============================================================================
// Query Errors
// ============================================================================

/**
 * Query error - issues with search queries
 */
export class QueryError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false, statusCode: options.statusCode ?? 400 });
  }
}

/**
 * Invalid filter error
 */
export class InvalidFilterError extends QueryError {
  public readonly filterExpression: string;
  public readonly reason: string;

  constructor(filterExpression: string, reason: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Invalid filter: ${reason}`,
      ...options,
      code: 'invalid_filter',
    });
    this.filterExpression = filterExpression;
    this.reason = reason;
  }
}

/**
 * Invalid order by error
 */
export class InvalidOrderByError extends QueryError {
  public readonly orderByExpression: string;
  public readonly reason: string;

  constructor(orderByExpression: string, reason: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Invalid order by: ${reason}`,
      ...options,
      code: 'invalid_orderby',
    });
    this.orderByExpression = orderByExpression;
    this.reason = reason;
  }
}

/**
 * Vector dimension mismatch error
 */
export class VectorDimensionMismatchError extends QueryError {
  public readonly expected: number;
  public readonly actual: number;

  constructor(expected: number, actual: number, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Vector dimension mismatch: expected ${expected}, got ${actual}`,
      ...options,
      code: 'vector_dimension_mismatch',
    });
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Syntax error in query
 */
export class SyntaxError extends QueryError {
  constructor(message: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Syntax error: ${message}`,
      ...options,
      code: 'syntax_error',
    });
  }
}

// ============================================================================
// Network Errors
// ============================================================================

/**
 * Network error - connection/transport issues
 */
export class NetworkError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'>) {
    super({ ...options, retryable: true });
  }
}

/**
 * Connection failed error
 */
export class ConnectionFailedError extends NetworkError {
  constructor(endpoint: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Connection failed to ${endpoint}`,
      ...options,
      code: 'connection_failed',
    });
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends NetworkError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: Partial<AcsErrorOptions>) {
    super({
      message: `Request timed out after ${timeoutMs}ms`,
      ...options,
      code: 'timeout',
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * DNS resolution failed error
 */
export class DnsResolutionFailedError extends NetworkError {
  constructor(hostname: string, options?: Partial<AcsErrorOptions>) {
    super({
      message: `DNS resolution failed for ${hostname}`,
      ...options,
      code: 'dns_resolution_failed',
    });
  }
}

// ============================================================================
// Server Errors
// ============================================================================

/**
 * Server error - Azure service issues
 */
export class ServerError extends AcsError {
  constructor(options: Omit<AcsErrorOptions, 'retryable'> & { retryable?: boolean }) {
    super({ retryable: true, ...options });
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends ServerError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Internal server error',
      ...options,
      statusCode: 500,
      code: 'internal_error',
    });
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends ServerError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Service unavailable',
      ...options,
      statusCode: 503,
      code: 'service_unavailable',
    });
  }
}

/**
 * Service busy error (429)
 */
export class ServiceBusyError extends ServerError {
  constructor(retryAfterMs?: number, options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Service busy - rate limited',
      ...options,
      statusCode: 429,
      code: 'service_busy',
      retryAfterMs,
    });
  }
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends ServerError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Quota exceeded',
      ...options,
      statusCode: 429,
      code: 'quota_exceeded',
      retryable: false,
    });
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitOpenError extends AcsError {
  constructor(options?: Partial<AcsErrorOptions>) {
    super({
      message: 'Circuit breaker is open - operation rejected',
      ...options,
      code: 'circuit_open',
      retryable: false,
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AcsError) {
    return error.retryable;
  }
  return false;
}

/**
 * Get retry delay from error
 */
export function getRetryDelay(error: unknown): number | undefined {
  if (error instanceof AcsError) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Map HTTP status code to appropriate error class
 */
export function mapStatusToError(
  statusCode: number,
  message: string,
  options?: Partial<AcsErrorOptions>
): AcsError {
  switch (statusCode) {
    case 400:
      return new QueryError({ message, ...options, statusCode });
    case 401:
      return new AuthenticationError({ message, ...options, statusCode });
    case 403:
      return new PermissionDeniedError({ message, ...options });
    case 404:
      return new IndexNotFoundError(options?.index ?? 'unknown', { message, ...options });
    case 409:
      return new DocumentError({ message, ...options, statusCode, code: 'conflict' });
    case 429:
      return new ServiceBusyError(options?.retryAfterMs, { message, ...options });
    case 500:
      return new InternalServerError({ message, ...options });
    case 503:
      return new ServiceUnavailableError({ message, ...options });
    default:
      if (statusCode >= 500) {
        return new ServerError({ message, ...options, statusCode });
      }
      return new QueryError({ message, ...options, statusCode });
  }
}
