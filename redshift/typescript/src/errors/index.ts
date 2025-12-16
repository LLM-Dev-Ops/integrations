/**
 * Redshift Integration Error Types
 *
 * Error classes for the Redshift integration module.
 * @module @llmdevops/redshift-integration/errors
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Redshift error codes mapped to categories.
 */
export enum RedshiftErrorCode {
  // Connection errors
  CONNECTION_FAILED = 'RS_CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'RS_CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'RS_CONNECTION_LOST',
  SESSION_EXPIRED = 'RS_SESSION_EXPIRED',

  // Authentication errors
  AUTHENTICATION_FAILED = 'RS_AUTH_FAILED',
  INVALID_CREDENTIALS = 'RS_INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'RS_TOKEN_EXPIRED',

  // Pool errors
  POOL_EXHAUSTED = 'RS_POOL_EXHAUSTED',
  ACQUIRE_TIMEOUT = 'RS_ACQUIRE_TIMEOUT',

  // Query errors
  QUERY_FAILED = 'RS_QUERY_FAILED',
  QUERY_TIMEOUT = 'RS_QUERY_TIMEOUT',
  QUERY_CANCELLED = 'RS_QUERY_CANCELLED',
  SYNTAX_ERROR = 'RS_SYNTAX_ERROR',
  OBJECT_NOT_FOUND = 'RS_OBJECT_NOT_FOUND',
  PERMISSION_DENIED = 'RS_PERMISSION_DENIED',

  // Transaction errors
  TRANSACTION_FAILED = 'RS_TRANSACTION_FAILED',
  TRANSACTION_ABORTED = 'RS_TRANSACTION_ABORTED',
  DEADLOCK = 'RS_DEADLOCK',

  // Resource errors
  RESOURCE_LIMIT = 'RS_RESOURCE_LIMIT',
  DISK_FULL = 'RS_DISK_FULL',
  OUT_OF_MEMORY = 'RS_OUT_OF_MEMORY',
  RESOURCE_BUSY = 'RS_RESOURCE_BUSY',

  // Data errors
  DATA_TYPE_MISMATCH = 'RS_DATA_TYPE_MISMATCH',
  CONSTRAINT_VIOLATION = 'RS_CONSTRAINT_VIOLATION',
  DIVISION_BY_ZERO = 'RS_DIVISION_BY_ZERO',
  NUMERIC_OVERFLOW = 'RS_NUMERIC_OVERFLOW',

  // Ingestion errors
  COPY_FAILED = 'RS_COPY_FAILED',
  UNLOAD_FAILED = 'RS_UNLOAD_FAILED',

  // Spectrum errors
  SPECTRUM_ERROR = 'RS_SPECTRUM_ERROR',

  // Permission errors (specific)
  TABLE_NOT_FOUND = 'RS_TABLE_NOT_FOUND',
  COLUMN_NOT_FOUND = 'RS_COLUMN_NOT_FOUND',

  // Transaction errors (specific)
  SERIALIZATION_FAILURE = 'RS_SERIALIZATION_FAILURE',

  // Resilience errors
  CIRCUIT_BREAKER_OPEN = 'RS_CIRCUIT_BREAKER_OPEN',
  RETRY_EXHAUSTED = 'RS_RETRY_EXHAUSTED',

  // Configuration errors
  INVALID_CONFIG = 'RS_INVALID_CONFIG',
  MISSING_CONFIG = 'RS_MISSING_CONFIG',

  // General errors
  INTERNAL_ERROR = 'RS_INTERNAL_ERROR',
  UNKNOWN_ERROR = 'RS_UNKNOWN_ERROR',
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error class for all Redshift errors.
 */
export class RedshiftError extends Error {
  /** Error code */
  readonly code: RedshiftErrorCode;
  /** SQL state (if applicable) */
  readonly sqlState?: string;
  /** Query ID (if applicable) */
  readonly queryId?: string;
  /** Original error */
  readonly cause?: Error;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Additional context */
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: RedshiftErrorCode,
    options?: {
      sqlState?: string;
      queryId?: string;
      cause?: Error;
      retryable?: boolean;
      context?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'RedshiftError';
    this.code = code;
    this.sqlState = options?.sqlState;
    this.queryId = options?.queryId;
    this.cause = options?.cause;
    this.retryable = options?.retryable ?? false;
    this.context = options?.context;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a detailed error message including context.
   */
  toDetailedString(): string {
    const parts = [`${this.name} [${this.code}]: ${this.message}`];
    if (this.sqlState) parts.push(`SQL State: ${this.sqlState}`);
    if (this.queryId) parts.push(`Query ID: ${this.queryId}`);
    if (this.cause) parts.push(`Caused by: ${this.cause.message}`);
    if (this.context) parts.push(`Context: ${JSON.stringify(this.context)}`);
    return parts.join('\n');
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

/**
 * Connection failed error.
 */
export class ConnectionError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.CONNECTION_FAILED, {
      cause,
      retryable: true,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Connection timeout error.
 */
export class ConnectionTimeoutError extends RedshiftError {
  constructor(timeoutMs: number, cause?: Error) {
    super(`Connection timed out after ${timeoutMs}ms`, RedshiftErrorCode.CONNECTION_TIMEOUT, {
      cause,
      retryable: true,
      context: { timeoutMs },
    });
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * Connection lost error.
 */
export class ConnectionLostError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.CONNECTION_LOST, {
      cause,
      retryable: true,
    });
    this.name = 'ConnectionLostError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Authentication failed error.
 */
export class AuthenticationError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.AUTHENTICATION_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Invalid credentials error.
 */
export class InvalidCredentialsError extends RedshiftError {
  constructor(message: string = 'Invalid credentials provided') {
    super(message, RedshiftErrorCode.INVALID_CREDENTIALS, {
      retryable: false,
    });
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Token expired error.
 */
export class TokenExpiredError extends RedshiftError {
  constructor(message: string = 'Authentication token has expired') {
    super(message, RedshiftErrorCode.TOKEN_EXPIRED, {
      retryable: true,
    });
    this.name = 'TokenExpiredError';
  }
}

// ============================================================================
// Pool Errors
// ============================================================================

/**
 * Pool exhausted error.
 */
export class PoolExhaustedError extends RedshiftError {
  constructor(maxConnections: number) {
    super(
      `Connection pool exhausted (max: ${maxConnections})`,
      RedshiftErrorCode.POOL_EXHAUSTED,
      { retryable: true, context: { maxConnections } }
    );
    this.name = 'PoolExhaustedError';
  }
}

/**
 * Acquire timeout error.
 */
export class AcquireTimeoutError extends RedshiftError {
  constructor(timeoutMs: number) {
    super(
      `Failed to acquire connection within ${timeoutMs}ms`,
      RedshiftErrorCode.ACQUIRE_TIMEOUT,
      { retryable: true, context: { timeoutMs } }
    );
    this.name = 'AcquireTimeoutError';
  }
}

// ============================================================================
// Query Errors
// ============================================================================

/**
 * Query failed error.
 */
export class QueryError extends RedshiftError {
  constructor(
    message: string,
    options?: {
      sqlState?: string;
      queryId?: string;
      cause?: Error;
    }
  ) {
    super(message, RedshiftErrorCode.QUERY_FAILED, {
      ...options,
      retryable: false,
    });
    this.name = 'QueryError';
  }
}

/**
 * Query timeout error.
 */
export class QueryTimeoutError extends RedshiftError {
  constructor(queryId: string, timeoutMs: number, cause?: Error) {
    super(
      `Query ${queryId} timed out after ${timeoutMs}ms`,
      RedshiftErrorCode.QUERY_TIMEOUT,
      { queryId, cause, retryable: true, context: { timeoutMs } }
    );
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Query cancelled error.
 */
export class QueryCancelledError extends RedshiftError {
  constructor(queryId: string) {
    super(`Query ${queryId} was cancelled`, RedshiftErrorCode.QUERY_CANCELLED, {
      queryId,
      retryable: false,
    });
    this.name = 'QueryCancelledError';
  }
}

/**
 * SQL syntax error.
 */
export class SyntaxError extends RedshiftError {
  constructor(message: string, sqlState?: string, queryId?: string) {
    super(message, RedshiftErrorCode.SYNTAX_ERROR, {
      sqlState,
      queryId,
      retryable: false,
    });
    this.name = 'SyntaxError';
  }
}

/**
 * Object not found error (generic).
 */
export class ObjectNotFoundError extends RedshiftError {
  constructor(objectType: string, objectName: string) {
    super(
      `${objectType} '${objectName}' does not exist or not authorized`,
      objectType.toLowerCase() === 'table'
        ? RedshiftErrorCode.TABLE_NOT_FOUND
        : objectType.toLowerCase() === 'column'
        ? RedshiftErrorCode.COLUMN_NOT_FOUND
        : RedshiftErrorCode.OBJECT_NOT_FOUND,
      { retryable: false, context: { objectType, objectName } }
    );
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends RedshiftError {
  constructor(operation: string, object?: string) {
    const msg = object
      ? `Permission denied for ${operation} on ${object}`
      : `Permission denied for ${operation}`;
    super(msg, RedshiftErrorCode.PERMISSION_DENIED, {
      retryable: false,
      context: { operation, object },
    });
    this.name = 'PermissionDeniedError';
  }
}

// ============================================================================
// Transaction Errors
// ============================================================================

/**
 * Serialization failure error (concurrent transaction conflict).
 */
export class SerializationFailureError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.SERIALIZATION_FAILURE, {
      cause,
      retryable: true,
    });
    this.name = 'SerializationFailureError';
  }
}

/**
 * Transaction failed error.
 */
export class TransactionError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.TRANSACTION_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'TransactionError';
  }
}

// ============================================================================
// Resource Errors
// ============================================================================

/**
 * Disk full error.
 */
export class DiskFullError extends RedshiftError {
  constructor(message: string = 'Disk full', cause?: Error) {
    super(message, RedshiftErrorCode.DISK_FULL, {
      cause,
      retryable: false,
    });
    this.name = 'DiskFullError';
  }
}

/**
 * Out of memory error.
 */
export class OutOfMemoryError extends RedshiftError {
  constructor(message: string = 'Out of memory', cause?: Error) {
    super(message, RedshiftErrorCode.OUT_OF_MEMORY, {
      cause,
      retryable: false,
    });
    this.name = 'OutOfMemoryError';
  }
}

/**
 * Resource busy error.
 */
export class ResourceBusyError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.RESOURCE_BUSY, {
      cause,
      retryable: true,
    });
    this.name = 'ResourceBusyError';
  }
}

// ============================================================================
// Data Errors
// ============================================================================

/**
 * Data type mismatch error.
 */
export class DataTypeMismatchError extends RedshiftError {
  constructor(message: string, sqlState?: string, queryId?: string) {
    super(message, RedshiftErrorCode.DATA_TYPE_MISMATCH, {
      sqlState,
      queryId,
      retryable: false,
    });
    this.name = 'DataTypeMismatchError';
  }
}

/**
 * Constraint violation error.
 */
export class ConstraintViolationError extends RedshiftError {
  constructor(message: string, sqlState?: string, queryId?: string) {
    super(message, RedshiftErrorCode.CONSTRAINT_VIOLATION, {
      sqlState,
      queryId,
      retryable: false,
    });
    this.name = 'ConstraintViolationError';
  }
}

// ============================================================================
// COPY/UNLOAD Errors
// ============================================================================

/**
 * COPY command failed error.
 */
export class CopyFailedError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.COPY_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'CopyFailedError';
  }
}

/**
 * UNLOAD command failed error.
 */
export class UnloadFailedError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.UNLOAD_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'UnloadFailedError';
  }
}

// ============================================================================
// Spectrum Errors
// ============================================================================

/**
 * Redshift Spectrum error.
 */
export class SpectrumError extends RedshiftError {
  constructor(message: string, cause?: Error) {
    super(message, RedshiftErrorCode.SPECTRUM_ERROR, {
      cause,
      retryable: false,
    });
    this.name = 'SpectrumError';
  }
}

// ============================================================================
// Resilience Errors
// ============================================================================

/**
 * Circuit breaker open error.
 */
export class CircuitBreakerOpenError extends RedshiftError {
  constructor(message: string = 'Circuit breaker is open') {
    super(message, RedshiftErrorCode.CIRCUIT_BREAKER_OPEN, {
      retryable: false,
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Retry exhausted error.
 */
export class RetryExhaustedError extends RedshiftError {
  constructor(attempts: number, cause?: Error) {
    super(
      `All ${attempts} retry attempts exhausted`,
      RedshiftErrorCode.RETRY_EXHAUSTED,
      { cause, retryable: false, context: { attempts } }
    );
    this.name = 'RetryExhaustedError';
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Invalid configuration error.
 */
export class ConfigurationError extends RedshiftError {
  constructor(message: string) {
    super(message, RedshiftErrorCode.INVALID_CONFIG, {
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Missing configuration error.
 */
export class MissingConfigurationError extends RedshiftError {
  constructor(configKey: string) {
    super(
      `Missing required configuration: ${configKey}`,
      RedshiftErrorCode.MISSING_CONFIG,
      { retryable: false, context: { configKey } }
    );
    this.name = 'MissingConfigurationError';
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Checks if an error is a RedshiftError.
 */
export function isRedshiftError(error: unknown): error is RedshiftError {
  return error instanceof RedshiftError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isRedshiftError(error)) {
    return error.retryable;
  }
  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('temporarily unavailable') ||
      message.includes('serialization failure') ||
      message.includes('deadlock')
    );
  }
  return false;
}

/**
 * Wraps an unknown error as a RedshiftError.
 */
export function wrapError(error: unknown, context?: string): RedshiftError {
  if (isRedshiftError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  const fullMessage = context ? `${context}: ${message}` : message;

  return new RedshiftError(fullMessage, RedshiftErrorCode.UNKNOWN_ERROR, {
    cause,
    retryable: isRetryableError(error),
  });
}

/**
 * PostgreSQL error interface for type safety.
 */
interface PgError extends Error {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

/**
 * Creates a RedshiftError from a PostgreSQL driver error.
 *
 * Maps PostgreSQL SQLSTATE codes to appropriate Redshift error types:
 * - 08xxx: Connection errors (retryable)
 * - 28xxx: Authentication errors (not retryable)
 * - 40001: Serialization failure (retryable)
 * - 40P01: Deadlock (retryable)
 * - 42xxx: SQL syntax/access errors (not retryable)
 * - 42P01: Table not found (not retryable)
 * - 42703: Column not found (not retryable)
 * - 42601: Syntax error (not retryable)
 * - 42501: Permission denied (not retryable)
 * - 42804: Data type mismatch (not retryable)
 * - 23xxx: Constraint violations (not retryable)
 * - 53100: Disk full (not retryable)
 * - 53200: Out of memory (not retryable)
 * - 53xxx: Other resource errors (retryable)
 * - 57014: Query cancelled (not retryable)
 *
 * @param pgError - PostgreSQL driver error object
 * @returns Appropriate RedshiftError subclass
 */
export function fromPgError(pgError: unknown): RedshiftError {
  if (isRedshiftError(pgError)) {
    return pgError;
  }

  const error = pgError as PgError;
  const message = error.message || 'Unknown PostgreSQL error';
  const sqlState = error.code;
  const cause = error instanceof Error ? error : undefined;

  // If no SQLSTATE code, return generic error
  if (!sqlState) {
    return new RedshiftError(message, RedshiftErrorCode.UNKNOWN_ERROR, {
      cause,
      retryable: isRetryableError(error),
    });
  }

  // Map based on SQLSTATE code
  const stateClass = sqlState.substring(0, 2);
  const fullCode = sqlState;

  // Class 08: Connection Exception
  if (stateClass === '08') {
    if (fullCode === '08001' || fullCode === '08006') {
      return new ConnectionError(message, cause);
    }
    if (fullCode === '08003') {
      return new ConnectionLostError(message, cause);
    }
    return new ConnectionError(message, cause);
  }

  // Class 28: Invalid Authorization Specification
  if (stateClass === '28') {
    if (fullCode === '28P01') {
      return new InvalidCredentialsError(message);
    }
    return new AuthenticationError(message, cause);
  }

  // Class 40: Transaction Rollback
  if (stateClass === '40') {
    if (fullCode === '40001') {
      return new SerializationFailureError(message, cause);
    }
    if (fullCode === '40P01') {
      return new SerializationFailureError(`Deadlock detected: ${message}`, cause);
    }
    return new TransactionError(message, cause);
  }

  // Class 42: Syntax Error or Access Rule Violation
  if (stateClass === '42') {
    if (fullCode === '42P01') {
      // Undefined table
      const tableName = error.table || 'unknown';
      return new ObjectNotFoundError('Table', tableName);
    }
    if (fullCode === '42703') {
      // Undefined column
      const columnName = error.column || 'unknown';
      return new ObjectNotFoundError('Column', columnName);
    }
    if (fullCode === '42601') {
      // Syntax error
      return new SyntaxError(message, sqlState);
    }
    if (fullCode === '42501') {
      // Insufficient privilege
      return new PermissionDeniedError('operation', error.table);
    }
    if (fullCode === '42804') {
      // Data type mismatch
      return new DataTypeMismatchError(message, sqlState);
    }
    // Generic syntax/access error
    return new QueryError(message, { sqlState, cause });
  }

  // Class 23: Integrity Constraint Violation
  if (stateClass === '23') {
    return new ConstraintViolationError(message, sqlState);
  }

  // Class 53: Insufficient Resources
  if (stateClass === '53') {
    if (fullCode === '53100') {
      return new DiskFullError(message, cause);
    }
    if (fullCode === '53200') {
      return new OutOfMemoryError(message, cause);
    }
    if (fullCode === '53300') {
      return new PoolExhaustedError(0); // Max connections unknown from error
    }
    // Other resource errors are typically retryable
    return new ResourceBusyError(message, cause);
  }

  // Class 57: Operator Intervention
  if (stateClass === '57') {
    if (fullCode === '57014') {
      return new QueryCancelledError('unknown');
    }
    if (fullCode === '57P03') {
      return new ConnectionError(message, cause);
    }
    // Other operator intervention errors
    return new RedshiftError(message, RedshiftErrorCode.INTERNAL_ERROR, {
      sqlState,
      cause,
      retryable: false,
    });
  }

  // Class 22: Data Exception
  if (stateClass === '22') {
    return new DataTypeMismatchError(message, sqlState);
  }

  // Default: generic error
  return new RedshiftError(message, RedshiftErrorCode.UNKNOWN_ERROR, {
    sqlState,
    cause,
    retryable: isRetryableError(error),
  });
}
