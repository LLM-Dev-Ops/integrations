/**
 * Salesforce error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps HTTP status codes and Salesforce API error responses to appropriate error types.
 */

/**
 * Error codes for Salesforce errors.
 */
export enum SalesforceErrorCode {
  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoAuthentication = 'NO_AUTHENTICATION',

  // Authentication errors
  AuthenticationError = 'AUTHENTICATION_ERROR',
  TokenExpired = 'TOKEN_EXPIRED',
  TokenRefreshFailed = 'TOKEN_REFRESH_FAILED',

  // Access errors
  PermissionDenied = 'PERMISSION_DENIED',
  RecordNotFound = 'RECORD_NOT_FOUND',
  SObjectNotFound = 'SOBJECT_NOT_FOUND',

  // Validation errors
  ValidationError = 'VALIDATION_ERROR',
  InvalidSoql = 'INVALID_SOQL',
  RequiredFieldMissing = 'REQUIRED_FIELD_MISSING',
  InvalidFieldValue = 'INVALID_FIELD_VALUE',
  DuplicateValue = 'DUPLICATE_VALUE',

  // Rate limiting
  RateLimited = 'RATE_LIMITED',
  DailyLimitExceeded = 'DAILY_LIMIT_EXCEEDED',
  ConcurrentRequestLimitExceeded = 'CONCURRENT_REQUEST_LIMIT_EXCEEDED',

  // Network/Server errors
  NetworkError = 'NETWORK_ERROR',
  TimeoutError = 'TIMEOUT_ERROR',
  ServerError = 'SERVER_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',

  // Bulk API errors
  BulkJobFailed = 'BULK_JOB_FAILED',
  BulkPartialFailure = 'BULK_PARTIAL_FAILURE',
  BulkJobAborted = 'BULK_JOB_ABORTED',
  BulkBatchFailed = 'BULK_BATCH_FAILED',

  // Platform Event errors
  EventPublishFailed = 'EVENT_PUBLISH_FAILED',
  SubscriptionFailed = 'SUBSCRIPTION_FAILED',
  EventDeliveryFailed = 'EVENT_DELIVERY_FAILED',

  // Simulation errors
  SimulationNoMatch = 'SIMULATION_NO_MATCH',
  SimulationLoadError = 'SIMULATION_LOAD_ERROR',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',

  // Entity locking
  EntityIsLocked = 'ENTITY_IS_LOCKED',
  UnableToLockRow = 'UNABLE_TO_LOCK_ROW',
}

/**
 * Salesforce API error response structure.
 */
export interface SalesforceApiErrorResponse {
  /** Error code from Salesforce */
  errorCode?: string;
  /** Error message */
  message?: string;
  /** Fields that caused the error */
  fields?: string[];
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Base Salesforce error class.
 */
export class SalesforceError extends Error {
  /** Error code */
  readonly code: SalesforceErrorCode;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: SalesforceErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'SalesforceError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      details: this.details,
    };
  }
}

// ============================================================================
// Configuration Errors (Non-Retryable)
// ============================================================================

/**
 * Configuration error.
 */
export class ConfigurationError extends SalesforceError {
  constructor(message: string) {
    super({
      code: SalesforceErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No authentication configured.
 */
export class NoAuthenticationError extends SalesforceError {
  constructor() {
    super({
      code: SalesforceErrorCode.NoAuthentication,
      message: 'No authentication configured (OAuth, JWT, or access token required)',
      retryable: false,
    });
    this.name = 'NoAuthenticationError';
  }
}

// ============================================================================
// Authentication Errors (Conditionally Retryable)
// ============================================================================

/**
 * Authentication failed.
 */
export class AuthenticationError extends SalesforceError {
  constructor(message: string = 'Authentication failed') {
    super({
      code: SalesforceErrorCode.AuthenticationError,
      message,
      statusCode: 401,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Token has expired.
 */
export class TokenExpiredError extends SalesforceError {
  constructor() {
    super({
      code: SalesforceErrorCode.TokenExpired,
      message: 'Authentication token has expired',
      statusCode: 401,
      retryable: true, // Can retry after refresh
    });
    this.name = 'TokenExpiredError';
  }
}

/**
 * Token refresh failed.
 */
export class TokenRefreshFailedError extends SalesforceError {
  constructor(message: string = 'Failed to refresh authentication token') {
    super({
      code: SalesforceErrorCode.TokenRefreshFailed,
      message,
      retryable: false,
    });
    this.name = 'TokenRefreshFailedError';
  }
}

// ============================================================================
// Access Errors (Non-Retryable)
// ============================================================================

/**
 * Permission denied.
 */
export class PermissionDeniedError extends SalesforceError {
  constructor(message: string = 'Permission denied for this operation') {
    super({
      code: SalesforceErrorCode.PermissionDenied,
      message,
      statusCode: 403,
      retryable: false,
    });
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Record not found.
 */
export class RecordNotFoundError extends SalesforceError {
  constructor(recordId: string, sobjectType?: string) {
    const typeInfo = sobjectType ? ` (${sobjectType})` : '';
    super({
      code: SalesforceErrorCode.RecordNotFound,
      message: `Record not found${typeInfo}: ${recordId}`,
      statusCode: 404,
      retryable: false,
      details: { recordId, sobjectType },
    });
    this.name = 'RecordNotFoundError';
  }
}

/**
 * SObject type not found.
 */
export class SObjectNotFoundError extends SalesforceError {
  constructor(sobjectType: string) {
    super({
      code: SalesforceErrorCode.SObjectNotFound,
      message: `SObject type not found: ${sobjectType}`,
      statusCode: 404,
      retryable: false,
      details: { sobjectType },
    });
    this.name = 'SObjectNotFoundError';
  }
}

// ============================================================================
// Validation Errors (Non-Retryable)
// ============================================================================

/**
 * Validation error.
 */
export class ValidationError extends SalesforceError {
  constructor(message: string, fields?: string[]) {
    super({
      code: SalesforceErrorCode.ValidationError,
      message: `Validation failed: ${message}`,
      statusCode: 400,
      retryable: false,
      details: { fields },
    });
    this.name = 'ValidationError';
  }
}

/**
 * Invalid SOQL query.
 */
export class InvalidSoqlError extends SalesforceError {
  constructor(query: string, reason?: string) {
    super({
      code: SalesforceErrorCode.InvalidSoql,
      message: reason ? `Invalid SOQL: ${reason}` : `Invalid SOQL query: ${query}`,
      statusCode: 400,
      retryable: false,
      details: { query, reason },
    });
    this.name = 'InvalidSoqlError';
  }
}

/**
 * Required field missing.
 */
export class RequiredFieldMissingError extends SalesforceError {
  constructor(fields: string[]) {
    super({
      code: SalesforceErrorCode.RequiredFieldMissing,
      message: `Required fields missing: ${fields.join(', ')}`,
      statusCode: 400,
      retryable: false,
      details: { fields },
    });
    this.name = 'RequiredFieldMissingError';
  }
}

/**
 * Invalid field value.
 */
export class InvalidFieldValueError extends SalesforceError {
  constructor(field: string, value: unknown, reason?: string) {
    const msg = reason
      ? `Invalid value for field '${field}': ${reason}`
      : `Invalid value for field '${field}': ${JSON.stringify(value)}`;
    super({
      code: SalesforceErrorCode.InvalidFieldValue,
      message: msg,
      statusCode: 400,
      retryable: false,
      details: { field, value, reason },
    });
    this.name = 'InvalidFieldValueError';
  }
}

/**
 * Duplicate value detected.
 */
export class DuplicateValueError extends SalesforceError {
  constructor(field: string, value: unknown) {
    super({
      code: SalesforceErrorCode.DuplicateValue,
      message: `Duplicate value detected for field '${field}': ${JSON.stringify(value)}`,
      statusCode: 400,
      retryable: false,
      details: { field, value },
    });
    this.name = 'DuplicateValueError';
  }
}

// ============================================================================
// Rate Limiting Errors (Retryable)
// ============================================================================

/**
 * Rate limited by Salesforce API.
 */
export class RateLimitedError extends SalesforceError {
  constructor(retryAfterMs: number) {
    super({
      code: SalesforceErrorCode.RateLimited,
      message: `Rate limited, retry after ${retryAfterMs}ms`,
      statusCode: 429,
      retryable: true,
      retryAfterMs,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Daily API limit exceeded.
 */
export class DailyLimitExceededError extends SalesforceError {
  constructor(limit?: number) {
    const limitInfo = limit ? ` (limit: ${limit})` : '';
    super({
      code: SalesforceErrorCode.DailyLimitExceeded,
      message: `Daily API limit exceeded${limitInfo}`,
      statusCode: 403,
      retryable: false,
      details: { limit },
    });
    this.name = 'DailyLimitExceededError';
  }
}

/**
 * Concurrent request limit exceeded.
 */
export class ConcurrentRequestLimitExceededError extends SalesforceError {
  constructor(retryAfterMs?: number) {
    super({
      code: SalesforceErrorCode.ConcurrentRequestLimitExceeded,
      message: 'Concurrent request limit exceeded',
      statusCode: 429,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 1000,
    });
    this.name = 'ConcurrentRequestLimitExceededError';
  }
}

/**
 * Rate limit timeout error when waiting for rate limit token exceeds queue timeout.
 */
export class RateLimitTimeoutError extends SalesforceError {
  constructor(waitedMs: number, timeoutMs: number) {
    super({
      code: SalesforceErrorCode.RateLimited,
      message: `Rate limit timeout: waited ${waitedMs}ms, exceeded timeout of ${timeoutMs}ms`,
      retryable: true,
      details: { waitedMs, timeoutMs },
    });
    this.name = 'RateLimitTimeoutError';
  }
}

// ============================================================================
// Network/Server Errors (Retryable)
// ============================================================================

/**
 * Network error.
 */
export class NetworkError extends SalesforceError {
  constructor(message: string, cause?: Error) {
    super({
      code: SalesforceErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Request timeout.
 */
export class TimeoutError extends SalesforceError {
  constructor(timeoutMs: number) {
    super({
      code: SalesforceErrorCode.TimeoutError,
      message: `Request timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Salesforce server error.
 */
export class ServerError extends SalesforceError {
  constructor(statusCode: number, message: string = 'Salesforce server error') {
    super({
      code: SalesforceErrorCode.ServerError,
      message,
      statusCode,
      retryable: true,
    });
    this.name = 'ServerError';
  }
}

/**
 * Service unavailable.
 */
export class ServiceUnavailableError extends SalesforceError {
  constructor(retryAfterMs?: number) {
    super({
      code: SalesforceErrorCode.ServiceUnavailable,
      message: 'Salesforce service is temporarily unavailable',
      statusCode: 503,
      retryable: true,
      retryAfterMs,
    });
    this.name = 'ServiceUnavailableError';
  }
}

// ============================================================================
// Bulk API Errors
// ============================================================================

/**
 * Bulk job failed.
 */
export class BulkJobFailedError extends SalesforceError {
  constructor(jobId: string, reason?: string) {
    const msg = reason ? `Bulk job failed: ${reason}` : `Bulk job failed: ${jobId}`;
    super({
      code: SalesforceErrorCode.BulkJobFailed,
      message: msg,
      retryable: false,
      details: { jobId, reason },
    });
    this.name = 'BulkJobFailedError';
  }
}

/**
 * Bulk operation had partial failures.
 */
export class BulkPartialFailureError extends SalesforceError {
  constructor(successCount: number, failureCount: number, failures?: unknown[]) {
    super({
      code: SalesforceErrorCode.BulkPartialFailure,
      message: `Bulk operation partially failed: ${successCount} succeeded, ${failureCount} failed`,
      retryable: false,
      details: { successCount, failureCount, failures },
    });
    this.name = 'BulkPartialFailureError';
  }
}

/**
 * Bulk job was aborted.
 */
export class BulkJobAbortedError extends SalesforceError {
  constructor(jobId: string) {
    super({
      code: SalesforceErrorCode.BulkJobAborted,
      message: `Bulk job was aborted: ${jobId}`,
      retryable: false,
      details: { jobId },
    });
    this.name = 'BulkJobAbortedError';
  }
}

/**
 * Bulk batch failed.
 */
export class BulkBatchFailedError extends SalesforceError {
  constructor(batchId: string, jobId: string, reason?: string) {
    const msg = reason
      ? `Bulk batch ${batchId} failed: ${reason}`
      : `Bulk batch failed: ${batchId}`;
    super({
      code: SalesforceErrorCode.BulkBatchFailed,
      message: msg,
      retryable: false,
      details: { batchId, jobId, reason },
    });
    this.name = 'BulkBatchFailedError';
  }
}

// ============================================================================
// Platform Event Errors
// ============================================================================

/**
 * Event publishing failed.
 */
export class EventPublishFailedError extends SalesforceError {
  constructor(eventType: string, reason?: string) {
    const msg = reason
      ? `Failed to publish event ${eventType}: ${reason}`
      : `Failed to publish event: ${eventType}`;
    super({
      code: SalesforceErrorCode.EventPublishFailed,
      message: msg,
      retryable: true,
      details: { eventType, reason },
    });
    this.name = 'EventPublishFailedError';
  }
}

/**
 * Event subscription failed.
 */
export class SubscriptionFailedError extends SalesforceError {
  constructor(channel: string, reason?: string) {
    const msg = reason
      ? `Failed to subscribe to ${channel}: ${reason}`
      : `Failed to subscribe to channel: ${channel}`;
    super({
      code: SalesforceErrorCode.SubscriptionFailed,
      message: msg,
      retryable: true,
      details: { channel, reason },
    });
    this.name = 'SubscriptionFailedError';
  }
}

/**
 * Event delivery failed.
 */
export class EventDeliveryFailedError extends SalesforceError {
  constructor(eventId: string, reason?: string) {
    const msg = reason
      ? `Event delivery failed for ${eventId}: ${reason}`
      : `Event delivery failed: ${eventId}`;
    super({
      code: SalesforceErrorCode.EventDeliveryFailed,
      message: msg,
      retryable: false,
      details: { eventId, reason },
    });
    this.name = 'EventDeliveryFailedError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * No matching simulation recording.
 */
export class SimulationNoMatchError extends SalesforceError {
  constructor(key: string) {
    super({
      code: SalesforceErrorCode.SimulationNoMatch,
      message: `No simulation recording matches key: ${key}`,
      retryable: false,
      details: { key },
    });
    this.name = 'SimulationNoMatchError';
  }
}

/**
 * Failed to load simulation recordings.
 */
export class SimulationLoadError extends SalesforceError {
  constructor(path: string, cause?: Error) {
    super({
      code: SalesforceErrorCode.SimulationLoadError,
      message: `Failed to load simulation recordings from: ${path}`,
      retryable: false,
      details: { path },
      cause,
    });
    this.name = 'SimulationLoadError';
  }
}

// ============================================================================
// Circuit Breaker Errors
// ============================================================================

/**
 * Circuit breaker is open.
 */
export class CircuitBreakerOpenError extends SalesforceError {
  constructor(resetTimeMs: number) {
    super({
      code: SalesforceErrorCode.CircuitBreakerOpen,
      message: 'Circuit breaker is open, rejecting requests',
      retryable: false,
      details: { resetTimeMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Entity Locking Errors (Retryable)
// ============================================================================

/**
 * Entity is locked by another process.
 */
export class EntityIsLockedError extends SalesforceError {
  constructor(recordId: string, retryAfterMs?: number) {
    super({
      code: SalesforceErrorCode.EntityIsLocked,
      message: `Entity is locked by another process: ${recordId}`,
      statusCode: 409,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 1000,
      details: { recordId },
    });
    this.name = 'EntityIsLockedError';
  }
}

/**
 * Unable to lock row for update.
 */
export class UnableToLockRowError extends SalesforceError {
  constructor(recordId: string, retryAfterMs?: number) {
    super({
      code: SalesforceErrorCode.UnableToLockRow,
      message: `Unable to lock row for update: ${recordId}`,
      statusCode: 409,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 1000,
      details: { recordId },
    });
    this.name = 'UnableToLockRowError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Parses a Salesforce API error response into the appropriate error type.
 */
export function parseSalesforceApiError(
  statusCode: number,
  body: SalesforceApiErrorResponse | SalesforceApiErrorResponse[] | null,
  retryAfterHeader?: string
): SalesforceError {
  // Salesforce can return an array of errors or a single error
  const errors = Array.isArray(body) ? body : body ? [body] : [];
  const firstError = errors[0];
  const errorCode = firstError?.errorCode ?? '';
  const message = firstError?.message ?? `HTTP ${statusCode}`;
  const fields = firstError?.fields ?? [];

  // Parse retry-after header if present
  let retryAfterMs: number | undefined;
  if (retryAfterHeader) {
    const retryAfter = parseFloat(retryAfterHeader);
    // Convert seconds to milliseconds
    retryAfterMs = retryAfter < 1000 ? retryAfter * 1000 : retryAfter;
  }

  // Map Salesforce error codes to our error types
  switch (errorCode) {
    // Authentication errors
    case 'INVALID_SESSION_ID':
    case 'INVALID_AUTH_HEADER':
      return new TokenExpiredError();

    // Permission errors
    case 'INSUFFICIENT_ACCESS':
    case 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY':
    case 'INSUFFICIENT_ACCESS_OR_READONLY':
      return new PermissionDeniedError(message);

    // Not found errors
    case 'NOT_FOUND':
    case 'ENTITY_IS_DELETED':
      if (fields.length > 0) {
        return new RecordNotFoundError(fields[0]);
      }
      return new RecordNotFoundError('unknown');

    case 'INVALID_TYPE':
    case 'INVALID_TYPE_FOR_OPERATION':
      return new SObjectNotFoundError(message);

    // Validation errors
    case 'REQUIRED_FIELD_MISSING':
      return new RequiredFieldMissingError(fields);

    case 'INVALID_FIELD':
    case 'INVALID_FIELD_FOR_INSERT_UPDATE':
      return new InvalidFieldValueError(
        fields[0] ?? 'unknown',
        undefined,
        message
      );

    case 'DUPLICATE_VALUE':
    case 'DUPLICATE_EXTERNAL_ID':
      return new DuplicateValueError(fields[0] ?? 'unknown', undefined);

    case 'MALFORMED_QUERY':
    case 'INVALID_QUERY_LOCATOR':
      return new InvalidSoqlError('', message);

    // Locking errors (retryable)
    case 'ENTITY_IS_LOCKED':
      return new EntityIsLockedError(fields[0] ?? 'unknown', retryAfterMs);

    case 'UNABLE_TO_LOCK_ROW':
    case 'ROW_ALREADY_LOCKED':
      return new UnableToLockRowError(fields[0] ?? 'unknown', retryAfterMs);

    // Rate limiting
    case 'REQUEST_LIMIT_EXCEEDED':
      if (message.toLowerCase().includes('concurrent')) {
        return new ConcurrentRequestLimitExceededError(retryAfterMs);
      }
      if (message.toLowerCase().includes('daily')) {
        return new DailyLimitExceededError();
      }
      return new RateLimitedError(retryAfterMs ?? 60000);

    // Generic errors based on status code
    default:
      break;
  }

  // Fall back to HTTP status code mapping
  switch (statusCode) {
    case 400:
      if (errorCode) {
        return new ValidationError(`${errorCode}: ${message}`, fields);
      }
      return new ValidationError(message, fields);

    case 401:
      if (message.toLowerCase().includes('expired')) {
        return new TokenExpiredError();
      }
      return new AuthenticationError(message);

    case 403:
      if (message.toLowerCase().includes('limit')) {
        return new DailyLimitExceededError();
      }
      return new PermissionDeniedError(message);

    case 404:
      if (message.toLowerCase().includes('sobject')) {
        return new SObjectNotFoundError(message);
      }
      return new RecordNotFoundError('unknown');

    case 409:
      // Conflict - likely a locking issue
      return new EntityIsLockedError('unknown', retryAfterMs);

    case 429:
      return new RateLimitedError(retryAfterMs ?? 60000);

    case 503:
      return new ServiceUnavailableError(retryAfterMs);

    default:
      if (statusCode >= 500) {
        return new ServerError(statusCode, message);
      }
      return new ValidationError(message, fields);
  }
}

/**
 * Checks if an error is a Salesforce error.
 */
export function isSalesforceError(error: unknown): error is SalesforceError {
  return error instanceof SalesforceError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isSalesforceError(error)) {
    return error.retryable;
  }
  // Network errors from fetch are typically retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

/**
 * Gets retry delay from error, if applicable.
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isSalesforceError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}
