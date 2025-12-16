/**
 * MongoDB error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps MongoDB driver errors to appropriate error types.
 */

/**
 * Error codes for MongoDB errors.
 */
export enum MongoDBErrorCode {
  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoConnectionString = 'NO_CONNECTION_STRING',
  InvalidConnectionString = 'INVALID_CONNECTION_STRING',

  // Authentication errors
  AuthenticationError = 'AUTHENTICATION_ERROR',
  AuthenticationExpired = 'AUTHENTICATION_EXPIRED',

  // Connection errors
  ConnectionFailed = 'CONNECTION_FAILED',
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  ConnectionPoolExhausted = 'CONNECTION_POOL_EXHAUSTED',

  // Network errors
  NetworkError = 'NETWORK_ERROR',
  TimeoutError = 'TIMEOUT_ERROR',
  ServerSelectionFailed = 'SERVER_SELECTION_FAILED',

  // Operation errors
  WriteError = 'WRITE_ERROR',
  BulkWriteError = 'BULK_WRITE_ERROR',
  DuplicateKeyError = 'DUPLICATE_KEY_ERROR',

  // Query errors
  InvalidQuery = 'INVALID_QUERY',
  InvalidAggregation = 'INVALID_AGGREGATION',
  CursorNotFound = 'CURSOR_NOT_FOUND',

  // Transaction errors
  TransactionError = 'TRANSACTION_ERROR',
  TransactionAborted = 'TRANSACTION_ABORTED',
  WriteConflict = 'WRITE_CONFLICT',

  // Rate limiting
  RateLimited = 'RATE_LIMITED',
  RateLimitTimeout = 'RATE_LIMIT_TIMEOUT',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',

  // Server errors
  ServerError = 'SERVER_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  NotPrimary = 'NOT_PRIMARY',
  NotReplicaSetMember = 'NOT_REPLICA_SET_MEMBER',
}

/**
 * Base MongoDB error class.
 */
export class MongoDBError extends Error {
  /** Error code */
  readonly code: MongoDBErrorCode;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: MongoDBErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'MongoDBError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
    if (options.cause) {
      (this as any).cause = options.cause;
    }
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
export class ConfigurationError extends MongoDBError {
  constructor(message: string) {
    super({
      code: MongoDBErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No connection string configured.
 */
export class NoConnectionStringError extends MongoDBError {
  constructor() {
    super({
      code: MongoDBErrorCode.NoConnectionString,
      message: 'No connection string configured',
      retryable: false,
    });
    this.name = 'NoConnectionStringError';
  }
}

/**
 * Invalid connection string format.
 */
export class InvalidConnectionStringError extends MongoDBError {
  constructor(message: string) {
    super({
      code: MongoDBErrorCode.InvalidConnectionString,
      message: `Invalid connection string: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidConnectionStringError';
  }
}

// ============================================================================
// Authentication Errors (Conditionally Retryable)
// ============================================================================

/**
 * Authentication failed.
 */
export class AuthenticationError extends MongoDBError {
  constructor(message: string = 'Authentication failed') {
    super({
      code: MongoDBErrorCode.AuthenticationError,
      message,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authentication credentials have expired.
 */
export class AuthenticationExpiredError extends MongoDBError {
  constructor() {
    super({
      code: MongoDBErrorCode.AuthenticationExpired,
      message: 'Authentication credentials have expired',
      retryable: true, // Can retry after refresh
    });
    this.name = 'AuthenticationExpiredError';
  }
}

// ============================================================================
// Connection Errors (Retryable)
// ============================================================================

/**
 * Connection to MongoDB failed.
 */
export class ConnectionFailedError extends MongoDBError {
  constructor(message: string, cause?: Error) {
    super({
      code: MongoDBErrorCode.ConnectionFailed,
      message: `Connection failed: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'ConnectionFailedError';
  }
}

/**
 * Connection attempt timed out.
 */
export class ConnectionTimeoutError extends MongoDBError {
  constructor(timeoutMs: number) {
    super({
      code: MongoDBErrorCode.ConnectionTimeout,
      message: `Connection timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * Connection pool exhausted.
 */
export class ConnectionPoolExhaustedError extends MongoDBError {
  constructor(poolSize: number) {
    super({
      code: MongoDBErrorCode.ConnectionPoolExhausted,
      message: `Connection pool exhausted (size: ${poolSize})`,
      retryable: true,
      details: { poolSize },
    });
    this.name = 'ConnectionPoolExhaustedError';
  }
}

// ============================================================================
// Network Errors (Retryable)
// ============================================================================

/**
 * Network error.
 */
export class NetworkError extends MongoDBError {
  constructor(message: string, cause?: Error) {
    super({
      code: MongoDBErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Operation timeout.
 */
export class TimeoutError extends MongoDBError {
  constructor(timeoutMs: number) {
    super({
      code: MongoDBErrorCode.TimeoutError,
      message: `Operation timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Server selection failed.
 */
export class ServerSelectionFailedError extends MongoDBError {
  constructor(message: string, cause?: Error) {
    super({
      code: MongoDBErrorCode.ServerSelectionFailed,
      message: `Server selection failed: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'ServerSelectionFailedError';
  }
}

// ============================================================================
// Operation Errors (Non-Retryable)
// ============================================================================

/**
 * Write operation error.
 */
export class WriteError extends MongoDBError {
  constructor(message: string, errorCode?: number) {
    super({
      code: MongoDBErrorCode.WriteError,
      message: `Write error: ${message}`,
      retryable: false,
      details: { errorCode },
    });
    this.name = 'WriteError';
  }
}

/**
 * Bulk write operation error.
 */
export class BulkWriteError extends MongoDBError {
  constructor(successCount: number, failureCount: number, details?: Record<string, unknown>) {
    super({
      code: MongoDBErrorCode.BulkWriteError,
      message: `Bulk write error: ${successCount} succeeded, ${failureCount} failed`,
      retryable: false,
      details: { successCount, failureCount, ...details },
    });
    this.name = 'BulkWriteError';
  }
}

/**
 * Duplicate key error.
 */
export class DuplicateKeyError extends MongoDBError {
  constructor(key: string, value: unknown) {
    super({
      code: MongoDBErrorCode.DuplicateKeyError,
      message: `Duplicate key error: ${key}`,
      retryable: false,
      details: { key, value },
    });
    this.name = 'DuplicateKeyError';
  }
}

// ============================================================================
// Query Errors (Non-Retryable)
// ============================================================================

/**
 * Invalid query.
 */
export class InvalidQueryError extends MongoDBError {
  constructor(message: string) {
    super({
      code: MongoDBErrorCode.InvalidQuery,
      message: `Invalid query: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidQueryError';
  }
}

/**
 * Invalid aggregation pipeline.
 */
export class InvalidAggregationError extends MongoDBError {
  constructor(message: string) {
    super({
      code: MongoDBErrorCode.InvalidAggregation,
      message: `Invalid aggregation: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidAggregationError';
  }
}

/**
 * Cursor not found.
 */
export class CursorNotFoundError extends MongoDBError {
  constructor(cursorId: string) {
    super({
      code: MongoDBErrorCode.CursorNotFound,
      message: `Cursor not found: ${cursorId}`,
      retryable: false,
      details: { cursorId },
    });
    this.name = 'CursorNotFoundError';
  }
}

// ============================================================================
// Transaction Errors (Conditionally Retryable)
// ============================================================================

/**
 * Transaction error.
 */
export class TransactionError extends MongoDBError {
  constructor(message: string) {
    super({
      code: MongoDBErrorCode.TransactionError,
      message: `Transaction error: ${message}`,
      retryable: false,
    });
    this.name = 'TransactionError';
  }
}

/**
 * Transaction was aborted.
 */
export class TransactionAbortedError extends MongoDBError {
  constructor(message: string = 'Transaction was aborted') {
    super({
      code: MongoDBErrorCode.TransactionAborted,
      message,
      retryable: true, // Transactions can be retried
    });
    this.name = 'TransactionAbortedError';
  }
}

/**
 * Write conflict in transaction.
 */
export class WriteConflictError extends MongoDBError {
  constructor() {
    super({
      code: MongoDBErrorCode.WriteConflict,
      message: 'Write conflict detected',
      retryable: true, // Can retry transaction
    });
    this.name = 'WriteConflictError';
  }
}

// ============================================================================
// Rate Limiting Errors (Retryable)
// ============================================================================

/**
 * Rate limited by MongoDB.
 */
export class RateLimitedError extends MongoDBError {
  constructor(retryAfterMs: number) {
    super({
      code: MongoDBErrorCode.RateLimited,
      message: `Rate limited, retry after ${retryAfterMs}ms`,
      retryable: true,
      retryAfterMs,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Rate limit wait time exceeded timeout.
 */
export class RateLimitTimeoutError extends MongoDBError {
  constructor(waitTime: number, maxWait: number) {
    super({
      code: MongoDBErrorCode.RateLimitTimeout,
      message: `Rate limit wait time (${waitTime}ms) exceeds maximum (${maxWait}ms)`,
      retryable: false,
      details: { waitTime, maxWait },
    });
    this.name = 'RateLimitTimeoutError';
  }
}

// ============================================================================
// Circuit Breaker Errors
// ============================================================================

/**
 * Circuit breaker is open.
 */
export class CircuitBreakerOpenError extends MongoDBError {
  constructor(resetTimeMs: number) {
    super({
      code: MongoDBErrorCode.CircuitBreakerOpen,
      message: 'Circuit breaker is open, rejecting requests',
      retryable: false,
      details: { resetTimeMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Server Errors (Retryable)
// ============================================================================

/**
 * MongoDB server error.
 */
export class ServerError extends MongoDBError {
  constructor(message: string = 'MongoDB server error', errorCode?: number) {
    super({
      code: MongoDBErrorCode.ServerError,
      message,
      retryable: true,
      details: { errorCode },
    });
    this.name = 'ServerError';
  }
}

/**
 * Service unavailable.
 */
export class ServiceUnavailableError extends MongoDBError {
  constructor(retryAfterMs?: number) {
    super({
      code: MongoDBErrorCode.ServiceUnavailable,
      message: 'MongoDB service is temporarily unavailable',
      retryable: true,
      retryAfterMs,
    });
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Not primary (replica set).
 */
export class NotPrimaryError extends MongoDBError {
  constructor(message: string = 'Not connected to primary node') {
    super({
      code: MongoDBErrorCode.NotPrimary,
      message,
      retryable: true, // Can retry after reconnecting to primary
    });
    this.name = 'NotPrimaryError';
  }
}

/**
 * Not a replica set member.
 */
export class NotReplicaSetMemberError extends MongoDBError {
  constructor(message: string = 'Not a replica set member') {
    super({
      code: MongoDBErrorCode.NotReplicaSetMember,
      message,
      retryable: false,
    });
    this.name = 'NotReplicaSetMemberError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * MongoDB driver error codes.
 * See: https://github.com/mongodb/mongo/blob/master/src/mongo/base/error_codes.yml
 */
const MONGODB_ERROR_CODES = {
  // Authentication
  AUTHENTICATION_FAILED: 18,
  AUTH_EXPIRED: 189,

  // Network
  NETWORK_TIMEOUT: 89,
  HOST_UNREACHABLE: 6,
  HOST_NOT_FOUND: 7,
  SOCKET_EXCEPTION: 9001,

  // Connection
  CONNECTION_POOL_EXHAUSTED: 9002,

  // Write errors
  DUPLICATE_KEY: 11000,
  WRITE_CONFLICT: 112,

  // Transaction errors
  TRANSACTION_ABORTED: 251,
  NO_SUCH_TRANSACTION: 251,

  // Replica set
  NOT_PRIMARY: 10107,
  NOT_PRIMARY_NO_SECONDARY_OK: 13435,
  NOT_PRIMARY_OR_SECONDARY: 13436,
  NOT_REPLICA_SET_MEMBER: 13297,

  // Query errors
  CURSOR_NOT_FOUND: 43,
  INVALID_NAMESPACE: 73,

  // Server errors
  INTERNAL_ERROR: 1,
  COMMAND_FAILED: 2,
  SERVICE_UNAVAILABLE: 93,
};

/**
 * Parses a MongoDB driver error into the appropriate error type.
 */
export function parseMongoDBError(error: unknown): MongoDBError {
  // Already a MongoDBError
  if (error instanceof MongoDBError) {
    return error;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    const message = error.message;
    const errorAny = error as any;
    const code = errorAny.code;

    // Check MongoDB driver error codes
    if (typeof code === 'number') {
      switch (code) {
        case MONGODB_ERROR_CODES.AUTHENTICATION_FAILED:
          return new AuthenticationError(message);

        case MONGODB_ERROR_CODES.AUTH_EXPIRED:
          return new AuthenticationExpiredError();

        case MONGODB_ERROR_CODES.DUPLICATE_KEY:
          // Extract key from error message if possible
          const keyMatch = message.match(/dup key: { ([^:]+):/);
          const key = keyMatch?.[1] ?? 'unknown';
          return new DuplicateKeyError(key, errorAny.keyValue);

        case MONGODB_ERROR_CODES.WRITE_CONFLICT:
          return new WriteConflictError();

        case MONGODB_ERROR_CODES.TRANSACTION_ABORTED:
        case MONGODB_ERROR_CODES.NO_SUCH_TRANSACTION:
          return new TransactionAbortedError(message);

        case MONGODB_ERROR_CODES.NOT_PRIMARY:
        case MONGODB_ERROR_CODES.NOT_PRIMARY_NO_SECONDARY_OK:
        case MONGODB_ERROR_CODES.NOT_PRIMARY_OR_SECONDARY:
          return new NotPrimaryError(message);

        case MONGODB_ERROR_CODES.NOT_REPLICA_SET_MEMBER:
          return new NotReplicaSetMemberError(message);

        case MONGODB_ERROR_CODES.CURSOR_NOT_FOUND:
          return new CursorNotFoundError(String(errorAny.cursorId || 'unknown'));

        case MONGODB_ERROR_CODES.NETWORK_TIMEOUT:
          return new TimeoutError(errorAny.timeout || 0);

        case MONGODB_ERROR_CODES.HOST_UNREACHABLE:
        case MONGODB_ERROR_CODES.HOST_NOT_FOUND:
        case MONGODB_ERROR_CODES.SOCKET_EXCEPTION:
          return new NetworkError(message, error);

        case MONGODB_ERROR_CODES.CONNECTION_POOL_EXHAUSTED:
          return new ConnectionPoolExhaustedError(errorAny.maxPoolSize || 0);

        case MONGODB_ERROR_CODES.SERVICE_UNAVAILABLE:
          return new ServiceUnavailableError();

        default:
          // Generic server error for unhandled codes
          if (code >= 10000) {
            return new ServerError(message, code);
          }
      }
    }

    // Check error name patterns
    const errorName = error.name || '';

    if (errorName.includes('MongoNetworkError') || errorName.includes('MongooseServerSelectionError')) {
      return new NetworkError(message, error);
    }

    if (errorName.includes('MongoServerSelectionError')) {
      return new ServerSelectionFailedError(message, error);
    }

    if (errorName.includes('MongoTimeoutError')) {
      return new TimeoutError(errorAny.timeout || 0);
    }

    if (errorName.includes('MongoWriteConcernError') || errorName.includes('MongoWriteError')) {
      return new WriteError(message, code);
    }

    if (errorName.includes('MongoBulkWriteError')) {
      const writeErrors = errorAny.writeErrors || [];
      return new BulkWriteError(
        errorAny.nInserted + errorAny.nUpserted + errorAny.nMatched + errorAny.nModified + errorAny.nRemoved || 0,
        writeErrors.length,
        { writeErrors }
      );
    }

    if (errorName.includes('MongoParseError')) {
      return new InvalidConnectionStringError(message);
    }

    if (errorName.includes('MongoAuthenticationError') || errorName.includes('MongoCredentialsError')) {
      return new AuthenticationError(message);
    }

    if (errorName.includes('MongoTransactionError')) {
      return new TransactionError(message);
    }

    // Check message patterns for specific errors
    if (message.toLowerCase().includes('connection') && message.toLowerCase().includes('timeout')) {
      return new ConnectionTimeoutError(errorAny.timeout || 0);
    }

    if (message.toLowerCase().includes('connection') && message.toLowerCase().includes('failed')) {
      return new ConnectionFailedError(message, error);
    }

    if (message.toLowerCase().includes('authentication') || message.toLowerCase().includes('auth')) {
      return new AuthenticationError(message);
    }

    if (message.toLowerCase().includes('invalid') && message.toLowerCase().includes('query')) {
      return new InvalidQueryError(message);
    }

    if (message.toLowerCase().includes('invalid') && message.toLowerCase().includes('aggregation')) {
      return new InvalidAggregationError(message);
    }

    if (message.toLowerCase().includes('transaction')) {
      return new TransactionError(message);
    }

    // Default to network error for connection-related issues
    if (message.toLowerCase().includes('network') || message.toLowerCase().includes('econnrefused') ||
        message.toLowerCase().includes('etimedout') || message.toLowerCase().includes('enotfound')) {
      return new NetworkError(message, error);
    }

    // Generic server error
    return new ServerError(message, code);
  }

  // Unknown error type
  return new ServerError(String(error));
}

/**
 * Checks if an error is a MongoDB error.
 */
export function isMongoDBError(error: unknown): error is MongoDBError {
  return error instanceof MongoDBError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isMongoDBError(error)) {
    return error.retryable;
  }
  // Network errors are typically retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Network-related errors are retryable
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      errorName.includes('network') ||
      errorName.includes('timeout')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Gets retry delay from error, if applicable.
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isMongoDBError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}
