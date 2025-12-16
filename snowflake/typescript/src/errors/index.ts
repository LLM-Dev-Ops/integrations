/**
 * Snowflake Integration Error Types
 *
 * Error classes for the Snowflake integration module.
 * @module @llmdevops/snowflake-integration/errors
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Snowflake error codes mapped to categories.
 */
export enum SnowflakeErrorCode {
  // Connection errors
  CONNECTION_FAILED = 'SF_CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'SF_CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'SF_CONNECTION_LOST',
  SESSION_EXPIRED = 'SF_SESSION_EXPIRED',

  // Authentication errors
  AUTHENTICATION_FAILED = 'SF_AUTH_FAILED',
  INVALID_CREDENTIALS = 'SF_INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'SF_TOKEN_EXPIRED',
  MFA_REQUIRED = 'SF_MFA_REQUIRED',

  // Pool errors
  POOL_EXHAUSTED = 'SF_POOL_EXHAUSTED',
  ACQUIRE_TIMEOUT = 'SF_ACQUIRE_TIMEOUT',

  // Query errors
  QUERY_FAILED = 'SF_QUERY_FAILED',
  QUERY_TIMEOUT = 'SF_QUERY_TIMEOUT',
  QUERY_CANCELLED = 'SF_QUERY_CANCELLED',
  SYNTAX_ERROR = 'SF_SYNTAX_ERROR',
  OBJECT_NOT_FOUND = 'SF_OBJECT_NOT_FOUND',
  PERMISSION_DENIED = 'SF_PERMISSION_DENIED',

  // Transaction errors
  TRANSACTION_FAILED = 'SF_TRANSACTION_FAILED',
  TRANSACTION_ABORTED = 'SF_TRANSACTION_ABORTED',
  DEADLOCK = 'SF_DEADLOCK',

  // Resource errors
  WAREHOUSE_SUSPENDED = 'SF_WAREHOUSE_SUSPENDED',
  WAREHOUSE_NOT_FOUND = 'SF_WAREHOUSE_NOT_FOUND',
  RESOURCE_LIMIT = 'SF_RESOURCE_LIMIT',

  // Data errors
  DATA_TYPE_MISMATCH = 'SF_DATA_TYPE_MISMATCH',
  CONSTRAINT_VIOLATION = 'SF_CONSTRAINT_VIOLATION',
  DIVISION_BY_ZERO = 'SF_DIVISION_BY_ZERO',
  NUMERIC_OVERFLOW = 'SF_NUMERIC_OVERFLOW',

  // Ingestion errors
  STAGE_NOT_FOUND = 'SF_STAGE_NOT_FOUND',
  FILE_NOT_FOUND = 'SF_FILE_NOT_FOUND',
  COPY_FAILED = 'SF_COPY_FAILED',
  PUT_FAILED = 'SF_PUT_FAILED',

  // Resilience errors
  CIRCUIT_BREAKER_OPEN = 'SF_CIRCUIT_BREAKER_OPEN',
  RETRY_EXHAUSTED = 'SF_RETRY_EXHAUSTED',

  // Configuration errors
  INVALID_CONFIG = 'SF_INVALID_CONFIG',
  MISSING_CONFIG = 'SF_MISSING_CONFIG',

  // General errors
  INTERNAL_ERROR = 'SF_INTERNAL_ERROR',
  UNKNOWN_ERROR = 'SF_UNKNOWN_ERROR',
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error class for all Snowflake errors.
 */
export class SnowflakeError extends Error {
  /** Error code */
  readonly code: SnowflakeErrorCode;
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
    code: SnowflakeErrorCode,
    options?: {
      sqlState?: string;
      queryId?: string;
      cause?: Error;
      retryable?: boolean;
      context?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'SnowflakeError';
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
export class ConnectionError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.CONNECTION_FAILED, {
      cause,
      retryable: true,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Connection timeout error.
 */
export class ConnectionTimeoutError extends SnowflakeError {
  constructor(timeoutMs: number, cause?: Error) {
    super(`Connection timed out after ${timeoutMs}ms`, SnowflakeErrorCode.CONNECTION_TIMEOUT, {
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
export class ConnectionLostError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.CONNECTION_LOST, {
      cause,
      retryable: true,
    });
    this.name = 'ConnectionLostError';
  }
}

/**
 * Session expired error.
 */
export class SessionExpiredError extends SnowflakeError {
  constructor(sessionId: string, cause?: Error) {
    super(`Session ${sessionId} has expired`, SnowflakeErrorCode.SESSION_EXPIRED, {
      cause,
      retryable: true,
      context: { sessionId },
    });
    this.name = 'SessionExpiredError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Authentication failed error.
 */
export class AuthenticationError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.AUTHENTICATION_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Invalid credentials error.
 */
export class InvalidCredentialsError extends SnowflakeError {
  constructor(message: string = 'Invalid credentials provided') {
    super(message, SnowflakeErrorCode.INVALID_CREDENTIALS, {
      retryable: false,
    });
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Token expired error.
 */
export class TokenExpiredError extends SnowflakeError {
  constructor(message: string = 'Authentication token has expired') {
    super(message, SnowflakeErrorCode.TOKEN_EXPIRED, {
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
export class PoolExhaustedError extends SnowflakeError {
  constructor(maxConnections: number) {
    super(
      `Connection pool exhausted (max: ${maxConnections})`,
      SnowflakeErrorCode.POOL_EXHAUSTED,
      { retryable: true, context: { maxConnections } }
    );
    this.name = 'PoolExhaustedError';
  }
}

/**
 * Acquire timeout error.
 */
export class AcquireTimeoutError extends SnowflakeError {
  constructor(timeoutMs: number) {
    super(
      `Failed to acquire connection within ${timeoutMs}ms`,
      SnowflakeErrorCode.ACQUIRE_TIMEOUT,
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
export class QueryError extends SnowflakeError {
  constructor(
    message: string,
    options?: {
      sqlState?: string;
      queryId?: string;
      cause?: Error;
    }
  ) {
    super(message, SnowflakeErrorCode.QUERY_FAILED, {
      ...options,
      retryable: false,
    });
    this.name = 'QueryError';
  }
}

/**
 * Query timeout error.
 */
export class QueryTimeoutError extends SnowflakeError {
  constructor(queryId: string, timeoutMs: number, cause?: Error) {
    super(
      `Query ${queryId} timed out after ${timeoutMs}ms`,
      SnowflakeErrorCode.QUERY_TIMEOUT,
      { queryId, cause, retryable: true, context: { timeoutMs } }
    );
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Query cancelled error.
 */
export class QueryCancelledError extends SnowflakeError {
  constructor(queryId: string) {
    super(`Query ${queryId} was cancelled`, SnowflakeErrorCode.QUERY_CANCELLED, {
      queryId,
      retryable: false,
    });
    this.name = 'QueryCancelledError';
  }
}

/**
 * SQL syntax error.
 */
export class SyntaxError extends SnowflakeError {
  constructor(message: string, sqlState?: string, queryId?: string) {
    super(message, SnowflakeErrorCode.SYNTAX_ERROR, {
      sqlState,
      queryId,
      retryable: false,
    });
    this.name = 'SyntaxError';
  }
}

/**
 * Object not found error.
 */
export class ObjectNotFoundError extends SnowflakeError {
  constructor(objectType: string, objectName: string) {
    super(
      `${objectType} '${objectName}' does not exist or not authorized`,
      SnowflakeErrorCode.OBJECT_NOT_FOUND,
      { retryable: false, context: { objectType, objectName } }
    );
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends SnowflakeError {
  constructor(operation: string, object?: string) {
    const msg = object
      ? `Permission denied for ${operation} on ${object}`
      : `Permission denied for ${operation}`;
    super(msg, SnowflakeErrorCode.PERMISSION_DENIED, {
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
 * Transaction failed error.
 */
export class TransactionError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.TRANSACTION_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'TransactionError';
  }
}

/**
 * Transaction aborted error.
 */
export class TransactionAbortedError extends SnowflakeError {
  constructor(reason: string, cause?: Error) {
    super(`Transaction aborted: ${reason}`, SnowflakeErrorCode.TRANSACTION_ABORTED, {
      cause,
      retryable: true,
    });
    this.name = 'TransactionAbortedError';
  }
}

/**
 * Deadlock error.
 */
export class DeadlockError extends SnowflakeError {
  constructor(cause?: Error) {
    super('Deadlock detected', SnowflakeErrorCode.DEADLOCK, {
      cause,
      retryable: true,
    });
    this.name = 'DeadlockError';
  }
}

// ============================================================================
// Resource Errors
// ============================================================================

/**
 * Warehouse suspended error.
 */
export class WarehouseSuspendedError extends SnowflakeError {
  constructor(warehouseName: string) {
    super(
      `Warehouse '${warehouseName}' is suspended`,
      SnowflakeErrorCode.WAREHOUSE_SUSPENDED,
      { retryable: true, context: { warehouseName } }
    );
    this.name = 'WarehouseSuspendedError';
  }
}

/**
 * Warehouse not found error.
 */
export class WarehouseNotFoundError extends SnowflakeError {
  constructor(warehouseName: string) {
    super(
      `Warehouse '${warehouseName}' does not exist`,
      SnowflakeErrorCode.WAREHOUSE_NOT_FOUND,
      { retryable: false, context: { warehouseName } }
    );
    this.name = 'WarehouseNotFoundError';
  }
}

/**
 * Resource limit error.
 */
export class ResourceLimitError extends SnowflakeError {
  constructor(message: string) {
    super(message, SnowflakeErrorCode.RESOURCE_LIMIT, {
      retryable: false,
    });
    this.name = 'ResourceLimitError';
  }
}

// ============================================================================
// Ingestion Errors
// ============================================================================

/**
 * Stage not found error.
 */
export class StageNotFoundError extends SnowflakeError {
  constructor(stageName: string) {
    super(
      `Stage '${stageName}' does not exist`,
      SnowflakeErrorCode.STAGE_NOT_FOUND,
      { retryable: false, context: { stageName } }
    );
    this.name = 'StageNotFoundError';
  }
}

/**
 * File not found error.
 */
export class FileNotFoundError extends SnowflakeError {
  constructor(fileName: string) {
    super(
      `File '${fileName}' not found`,
      SnowflakeErrorCode.FILE_NOT_FOUND,
      { retryable: false, context: { fileName } }
    );
    this.name = 'FileNotFoundError';
  }
}

/**
 * Copy failed error.
 */
export class CopyFailedError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.COPY_FAILED, {
      cause,
      retryable: false,
    });
    this.name = 'CopyFailedError';
  }
}

/**
 * PUT failed error.
 */
export class PutFailedError extends SnowflakeError {
  constructor(message: string, cause?: Error) {
    super(message, SnowflakeErrorCode.PUT_FAILED, {
      cause,
      retryable: true,
    });
    this.name = 'PutFailedError';
  }
}

// ============================================================================
// Resilience Errors
// ============================================================================

/**
 * Circuit breaker open error.
 */
export class CircuitBreakerOpenError extends SnowflakeError {
  constructor(message: string = 'Circuit breaker is open') {
    super(message, SnowflakeErrorCode.CIRCUIT_BREAKER_OPEN, {
      retryable: false,
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Retry exhausted error.
 */
export class RetryExhaustedError extends SnowflakeError {
  constructor(attempts: number, cause?: Error) {
    super(
      `All ${attempts} retry attempts exhausted`,
      SnowflakeErrorCode.RETRY_EXHAUSTED,
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
export class ConfigurationError extends SnowflakeError {
  constructor(message: string) {
    super(message, SnowflakeErrorCode.INVALID_CONFIG, {
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Missing configuration error.
 */
export class MissingConfigurationError extends SnowflakeError {
  constructor(configKey: string) {
    super(
      `Missing required configuration: ${configKey}`,
      SnowflakeErrorCode.MISSING_CONFIG,
      { retryable: false, context: { configKey } }
    );
    this.name = 'MissingConfigurationError';
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Checks if an error is a SnowflakeError.
 */
export function isSnowflakeError(error: unknown): error is SnowflakeError {
  return error instanceof SnowflakeError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isSnowflakeError(error)) {
    return error.retryable;
  }
  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('temporarily unavailable')
    );
  }
  return false;
}

/**
 * Wraps an unknown error as a SnowflakeError.
 */
export function wrapError(error: unknown, context?: string): SnowflakeError {
  if (isSnowflakeError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  const fullMessage = context ? `${context}: ${message}` : message;

  return new SnowflakeError(fullMessage, SnowflakeErrorCode.UNKNOWN_ERROR, {
    cause,
    retryable: isRetryableError(error),
  });
}

/**
 * Creates a SnowflakeError from a Snowflake SDK error.
 */
export function fromSdkError(sdkError: unknown): SnowflakeError {
  if (isSnowflakeError(sdkError)) {
    return sdkError;
  }

  const error = sdkError as {
    message?: string;
    code?: string | number;
    sqlState?: string;
    data?: { queryId?: string };
  };

  const message = error.message || 'Unknown Snowflake error';
  const sqlState = error.sqlState;
  const queryId = error.data?.queryId;

  // Map common Snowflake errors
  const code = String(error.code || '').toUpperCase();

  if (code.includes('AUTH') || code === '390100') {
    return new AuthenticationError(message, error instanceof Error ? error : undefined);
  }
  if (code.includes('TIMEOUT') || code === '604') {
    return new QueryTimeoutError(queryId || 'unknown', 0, error instanceof Error ? error : undefined);
  }
  if (code === '002003' || message.includes('does not exist')) {
    return new ObjectNotFoundError('Object', message);
  }
  if (code === '001003' || message.includes('syntax error')) {
    return new SyntaxError(message, sqlState, queryId);
  }

  return new SnowflakeError(message, SnowflakeErrorCode.UNKNOWN_ERROR, {
    sqlState,
    queryId,
    cause: error instanceof Error ? error : undefined,
    retryable: isRetryableError(error),
  });
}
