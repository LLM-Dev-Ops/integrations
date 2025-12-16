/**
 * SQL Server error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps SQL Server error numbers and states to appropriate error types.
 */

// ============================================================================
// SQL Server Error Codes
// ============================================================================

/**
 * SQL Server error codes (custom codes and common SQL Server error numbers).
 */
export enum SqlServerErrorCode {
  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoCredentials = 'NO_CREDENTIALS',
  InvalidConnectionString = 'INVALID_CONNECTION_STRING',

  // Connection errors
  ConnectionFailed = 'CONNECTION_FAILED',
  AcquireTimeout = 'ACQUIRE_TIMEOUT',
  PoolExhausted = 'POOL_EXHAUSTED',
  TlsError = 'TLS_ERROR',
  NetworkError = 'NETWORK_ERROR',

  // Authentication errors
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  LoginFailed = 'LOGIN_FAILED',
  PasswordExpired = 'PASSWORD_EXPIRED',

  // Query errors
  ExecutionError = 'EXECUTION_ERROR',
  NoRows = 'NO_ROWS',
  TooManyRows = 'TOO_MANY_ROWS',
  QueryTimeout = 'QUERY_TIMEOUT',
  ParamCountMismatch = 'PARAM_COUNT_MISMATCH',
  QueryCanceled = 'QUERY_CANCELED',

  // Transaction errors
  TransactionAborted = 'TRANSACTION_ABORTED',
  DeadlockDetected = 'DEADLOCK_DETECTED',
  LockTimeout = 'LOCK_TIMEOUT',
  InvalidSavepoint = 'INVALID_SAVEPOINT',
  TransactionRollback = 'TRANSACTION_ROLLBACK',
  SnapshotIsolationConflict = 'SNAPSHOT_ISOLATION_CONFLICT',

  // Type errors
  UnsupportedType = 'UNSUPPORTED_TYPE',
  ConversionError = 'CONVERSION_ERROR',
  NullValue = 'NULL_VALUE',
  InvalidJson = 'INVALID_JSON',
  ArithmeticOverflow = 'ARITHMETIC_OVERFLOW',
  StringTruncation = 'STRING_TRUNCATION',

  // Constraint violations
  UniqueViolation = 'UNIQUE_VIOLATION',
  ForeignKeyViolation = 'FOREIGN_KEY_VIOLATION',
  CheckViolation = 'CHECK_VIOLATION',
  NullViolation = 'NULL_VIOLATION',
  PrimaryKeyViolation = 'PRIMARY_KEY_VIOLATION',

  // Object errors
  ObjectNotFound = 'OBJECT_NOT_FOUND',
  ColumnNotFound = 'COLUMN_NOT_FOUND',
  InvalidObjectName = 'INVALID_OBJECT_NAME',
  InvalidColumnName = 'INVALID_COLUMN_NAME',

  // Syntax errors
  SyntaxError = 'SYNTAX_ERROR',
  PermissionDenied = 'PERMISSION_DENIED',

  // Protocol errors
  ProtocolError = 'PROTOCOL_ERROR',
  InvalidResponse = 'INVALID_RESPONSE',

  // Simulation errors
  SimulationMismatch = 'SIMULATION_MISMATCH',
  SimulatedError = 'SIMULATED_ERROR',
  RecordingNotFound = 'RECORDING_NOT_FOUND',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',
}

/**
 * Common SQL Server error numbers.
 * See: https://docs.microsoft.com/en-us/sql/relational-databases/errors-events/database-engine-events-and-errors
 */
export enum SqlServerErrorNumber {
  // Login errors
  LoginFailed = 18456,
  PasswordExpired = 18488,

  // Connection errors
  ServerNotFound = 53,
  NetworkError = 10054,
  ConnectionBroken = 10053,

  // Permission errors
  PermissionDenied = 229,
  ObjectPermissionDenied = 15247,

  // Object errors
  InvalidObjectName = 208,
  InvalidColumnName = 207,
  ObjectDoesNotExist = 2714,

  // Syntax errors
  SyntaxError = 102,
  IncorrectSyntax = 156,

  // Constraint violations
  UniqueConstraint = 2627,
  UniqueIndex = 2601,
  ForeignKeyInsert = 547,
  ForeignKeyDelete = 547,
  CheckConstraint = 547,
  NullConstraint = 515,
  PrimaryKeyViolation = 2627,

  // Transaction/Locking errors
  Deadlock = 1205,
  LockTimeout = 1222,
  TransactionAborted = 3998,
  SnapshotConflict = 3960,

  // Type conversion errors
  ConversionFailed = 245,
  ArithmeticOverflow = 8115,
  StringTruncation = 8152,
  DateTimeOverflow = 242,

  // Timeout
  QueryTimeout = -2,
}

/**
 * SQL Server error response structure.
 */
export interface SqlServerErrorResponse {
  /** SQL Server error number */
  number?: number;
  /** SQL Server error state */
  state?: number;
  /** SQL Server severity */
  class?: number;
  /** Error message */
  message?: string;
  /** Server name */
  serverName?: string;
  /** Procedure name (if error in stored procedure) */
  procName?: string;
  /** Line number in SQL batch or procedure */
  lineNumber?: number;
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base SQL Server error class.
 */
export class SqlServerError extends Error {
  /** Error code */
  readonly code: SqlServerErrorCode;
  /** SQL Server error number (if from SQL Server) */
  readonly errorNumber?: number;
  /** SQL Server error state */
  readonly errorState?: number;
  /** SQL Server severity class */
  readonly severity?: number;
  /** HTTP-like status code for API responses */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: SqlServerErrorCode;
    message: string;
    errorNumber?: number;
    errorState?: number;
    severity?: number;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'SqlServerError';
    this.code = options.code;
    this.errorNumber = options.errorNumber;
    this.errorState = options.errorState;
    this.severity = options.severity;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;

    // Manually set cause for compatibility
    if (options.cause) {
      (this as Record<string, unknown>).cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SqlServerError);
    }
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      errorNumber: this.errorNumber,
      errorState: this.errorState,
      severity: this.severity,
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
export class ConfigurationError extends SqlServerError {
  constructor(message: string) {
    super({
      code: SqlServerErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No credentials configured.
 */
export class NoCredentialsError extends SqlServerError {
  constructor() {
    super({
      code: SqlServerErrorCode.NoCredentials,
      message: 'No database credentials configured',
      retryable: false,
    });
    this.name = 'NoCredentialsError';
  }
}

/**
 * Invalid connection string format.
 */
export class InvalidConnectionStringError extends SqlServerError {
  constructor(connectionString: string, reason?: string) {
    super({
      code: SqlServerErrorCode.InvalidConnectionString,
      message: reason
        ? `Invalid connection string: ${reason}`
        : 'Invalid connection string format',
      retryable: false,
      details: { connectionString: connectionString.replace(/Password=[^;]+/i, 'Password=***') },
    });
    this.name = 'InvalidConnectionStringError';
  }
}

// ============================================================================
// Connection Errors (Conditionally Retryable)
// ============================================================================

/**
 * Connection to SQL Server failed.
 */
export class ConnectionFailedError extends SqlServerError {
  constructor(host: string, port: number, cause?: Error) {
    super({
      code: SqlServerErrorCode.ConnectionFailed,
      message: `Failed to connect to SQL Server at ${host}:${port}`,
      retryable: true,
      details: { host, port },
      cause,
    });
    this.name = 'ConnectionFailedError';
  }
}

/**
 * Timeout acquiring connection from pool.
 */
export class AcquireTimeoutError extends SqlServerError {
  constructor(timeoutMs: number) {
    super({
      code: SqlServerErrorCode.AcquireTimeout,
      message: `Timeout acquiring connection from pool after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'AcquireTimeoutError';
  }
}

/**
 * Connection pool exhausted.
 */
export class PoolExhaustedError extends SqlServerError {
  constructor(maxSize: number) {
    super({
      code: SqlServerErrorCode.PoolExhausted,
      message: `Connection pool exhausted (max size: ${maxSize})`,
      retryable: true,
      details: { maxSize },
    });
    this.name = 'PoolExhaustedError';
  }
}

/**
 * TLS/SSL connection error.
 */
export class TlsError extends SqlServerError {
  constructor(message: string, cause?: Error) {
    super({
      code: SqlServerErrorCode.TlsError,
      message: `TLS error: ${message}`,
      retryable: false,
      cause,
    });
    this.name = 'TlsError';
  }
}

/**
 * Network error.
 */
export class NetworkError extends SqlServerError {
  constructor(message: string, cause?: Error) {
    super({
      code: SqlServerErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

// ============================================================================
// Authentication Errors (Non-Retryable)
// ============================================================================

/**
 * Authentication failed.
 */
export class AuthenticationFailedError extends SqlServerError {
  constructor(user?: string, cause?: Error) {
    super({
      code: SqlServerErrorCode.AuthenticationFailed,
      errorNumber: SqlServerErrorNumber.LoginFailed,
      message: user
        ? `Authentication failed for user: ${user}`
        : 'Authentication failed',
      retryable: false,
      details: user ? { user } : undefined,
      cause,
    });
    this.name = 'AuthenticationFailedError';
  }
}

/**
 * Login failed.
 */
export class LoginFailedError extends SqlServerError {
  constructor(user: string, reason?: string) {
    super({
      code: SqlServerErrorCode.LoginFailed,
      errorNumber: SqlServerErrorNumber.LoginFailed,
      message: reason
        ? `Login failed for user '${user}': ${reason}`
        : `Login failed for user: ${user}`,
      retryable: false,
      details: { user },
    });
    this.name = 'LoginFailedError';
  }
}

/**
 * Password expired.
 */
export class PasswordExpiredError extends SqlServerError {
  constructor(user: string) {
    super({
      code: SqlServerErrorCode.PasswordExpired,
      errorNumber: SqlServerErrorNumber.PasswordExpired,
      message: `Password expired for user: ${user}`,
      retryable: false,
      details: { user },
    });
    this.name = 'PasswordExpiredError';
  }
}

// ============================================================================
// Query Errors (Mostly Non-Retryable)
// ============================================================================

/**
 * Query execution error.
 */
export class ExecutionError extends SqlServerError {
  constructor(message: string, errorNumber?: number, cause?: Error) {
    super({
      code: SqlServerErrorCode.ExecutionError,
      message: `Query execution failed: ${message}`,
      errorNumber,
      retryable: false,
      cause,
    });
    this.name = 'ExecutionError';
  }
}

/**
 * Query returned no rows when at least one was expected.
 */
export class NoRowsError extends SqlServerError {
  constructor() {
    super({
      code: SqlServerErrorCode.NoRows,
      message: 'Query returned no rows',
      retryable: false,
    });
    this.name = 'NoRowsError';
  }
}

/**
 * Query returned too many rows when only one was expected.
 */
export class TooManyRowsError extends SqlServerError {
  constructor(count: number) {
    super({
      code: SqlServerErrorCode.TooManyRows,
      message: `Query returned ${count} rows, expected 1`,
      retryable: false,
      details: { count },
    });
    this.name = 'TooManyRowsError';
  }
}

/**
 * Query exceeded timeout.
 */
export class QueryTimeoutError extends SqlServerError {
  constructor(timeoutMs: number) {
    super({
      code: SqlServerErrorCode.QueryTimeout,
      errorNumber: SqlServerErrorNumber.QueryTimeout,
      message: `Query timeout after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Parameter count mismatch.
 */
export class ParamCountMismatchError extends SqlServerError {
  constructor(expected: number, got: number) {
    super({
      code: SqlServerErrorCode.ParamCountMismatch,
      message: `Parameter count mismatch: expected ${expected}, got ${got}`,
      retryable: false,
      details: { expected, got },
    });
    this.name = 'ParamCountMismatchError';
  }
}

/**
 * Query was canceled.
 */
export class QueryCanceledError extends SqlServerError {
  constructor(reason?: string) {
    super({
      code: SqlServerErrorCode.QueryCanceled,
      message: reason ? `Query canceled: ${reason}` : 'Query was canceled',
      retryable: false,
      details: reason ? { reason } : undefined,
    });
    this.name = 'QueryCanceledError';
  }
}

// ============================================================================
// Transaction Errors
// ============================================================================

/**
 * Deadlock detected - should be retried.
 */
export class DeadlockDetectedError extends SqlServerError {
  constructor() {
    super({
      code: SqlServerErrorCode.DeadlockDetected,
      errorNumber: SqlServerErrorNumber.Deadlock,
      message: 'Deadlock detected, should be retried',
      retryable: true,
    });
    this.name = 'DeadlockDetectedError';
  }
}

/**
 * Lock timeout - should be retried.
 */
export class LockTimeoutError extends SqlServerError {
  constructor() {
    super({
      code: SqlServerErrorCode.LockTimeout,
      errorNumber: SqlServerErrorNumber.LockTimeout,
      message: 'Lock timeout exceeded, should be retried',
      retryable: true,
    });
    this.name = 'LockTimeoutError';
  }
}

/**
 * Transaction was aborted.
 */
export class TransactionAbortedError extends SqlServerError {
  constructor(reason?: string) {
    super({
      code: SqlServerErrorCode.TransactionAborted,
      errorNumber: SqlServerErrorNumber.TransactionAborted,
      message: reason
        ? `Transaction aborted: ${reason}`
        : 'Transaction in aborted state',
      retryable: false,
      details: reason ? { reason } : undefined,
    });
    this.name = 'TransactionAbortedError';
  }
}

/**
 * Invalid savepoint operation.
 */
export class InvalidSavepointError extends SqlServerError {
  constructor(savepoint: string, reason?: string) {
    super({
      code: SqlServerErrorCode.InvalidSavepoint,
      message: reason
        ? `Invalid savepoint '${savepoint}': ${reason}`
        : `Invalid savepoint: ${savepoint}`,
      retryable: false,
      details: { savepoint, reason },
    });
    this.name = 'InvalidSavepointError';
  }
}

/**
 * Generic transaction rollback.
 */
export class TransactionRollbackError extends SqlServerError {
  constructor(message: string, errorNumber?: number) {
    super({
      code: SqlServerErrorCode.TransactionRollback,
      errorNumber,
      message: `Transaction rollback: ${message}`,
      retryable: false,
    });
    this.name = 'TransactionRollbackError';
  }
}

/**
 * Snapshot isolation conflict.
 */
export class SnapshotIsolationConflictError extends SqlServerError {
  constructor() {
    super({
      code: SqlServerErrorCode.SnapshotIsolationConflict,
      errorNumber: SqlServerErrorNumber.SnapshotConflict,
      message: 'Snapshot isolation conflict, should be retried',
      retryable: true,
    });
    this.name = 'SnapshotIsolationConflictError';
  }
}

// ============================================================================
// Type Errors (Non-Retryable)
// ============================================================================

/**
 * Unsupported SQL Server type.
 */
export class UnsupportedTypeError extends SqlServerError {
  constructor(typeName: string) {
    super({
      code: SqlServerErrorCode.UnsupportedType,
      message: `Unsupported SQL Server type: ${typeName}`,
      retryable: false,
      details: { typeName },
    });
    this.name = 'UnsupportedTypeError';
  }
}

/**
 * Type conversion error.
 */
export class ConversionError extends SqlServerError {
  constructor(fromType: string, toType: string, value?: unknown) {
    super({
      code: SqlServerErrorCode.ConversionError,
      errorNumber: SqlServerErrorNumber.ConversionFailed,
      message: `Cannot convert from ${fromType} to ${toType}`,
      retryable: false,
      details: { fromType, toType, value },
    });
    this.name = 'ConversionError';
  }
}

/**
 * Unexpected NULL value.
 */
export class NullValueError extends SqlServerError {
  constructor(column: string) {
    super({
      code: SqlServerErrorCode.NullValue,
      message: `Unexpected NULL value in column: ${column}`,
      retryable: false,
      details: { column },
    });
    this.name = 'NullValueError';
  }
}

/**
 * Invalid JSON data.
 */
export class InvalidJsonError extends SqlServerError {
  constructor(message: string) {
    super({
      code: SqlServerErrorCode.InvalidJson,
      message: `Invalid JSON: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidJsonError';
  }
}

/**
 * Arithmetic overflow.
 */
export class ArithmeticOverflowError extends SqlServerError {
  constructor(value: unknown, type: string) {
    super({
      code: SqlServerErrorCode.ArithmeticOverflow,
      errorNumber: SqlServerErrorNumber.ArithmeticOverflow,
      message: `Arithmetic overflow for type ${type}`,
      retryable: false,
      details: { value, type },
    });
    this.name = 'ArithmeticOverflowError';
  }
}

/**
 * String truncation error.
 */
export class StringTruncationError extends SqlServerError {
  constructor(column: string, maxLength: number) {
    super({
      code: SqlServerErrorCode.StringTruncation,
      errorNumber: SqlServerErrorNumber.StringTruncation,
      message: `String data would be truncated for column ${column} (max length: ${maxLength})`,
      retryable: false,
      details: { column, maxLength },
    });
    this.name = 'StringTruncationError';
  }
}

// ============================================================================
// Constraint Violation Errors (Non-Retryable)
// ============================================================================

/**
 * Unique constraint violation.
 */
export class UniqueViolationError extends SqlServerError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: SqlServerErrorCode.UniqueViolation,
      errorNumber: SqlServerErrorNumber.UniqueConstraint,
      message: table
        ? `Unique constraint violated: ${constraint} on table ${table}`
        : `Unique constraint violated: ${constraint}`,
      retryable: false,
      details: { constraint, table, detail },
    });
    this.name = 'UniqueViolationError';
  }
}

/**
 * Primary key violation.
 */
export class PrimaryKeyViolationError extends SqlServerError {
  constructor(constraint: string, table?: string) {
    super({
      code: SqlServerErrorCode.PrimaryKeyViolation,
      errorNumber: SqlServerErrorNumber.PrimaryKeyViolation,
      message: table
        ? `Primary key violation: ${constraint} on table ${table}`
        : `Primary key violation: ${constraint}`,
      retryable: false,
      details: { constraint, table },
    });
    this.name = 'PrimaryKeyViolationError';
  }
}

/**
 * Foreign key constraint violation.
 */
export class ForeignKeyViolationError extends SqlServerError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: SqlServerErrorCode.ForeignKeyViolation,
      errorNumber: SqlServerErrorNumber.ForeignKeyInsert,
      message: table
        ? `Foreign key constraint violated: ${constraint} on table ${table}`
        : `Foreign key constraint violated: ${constraint}`,
      retryable: false,
      details: { constraint, table, detail },
    });
    this.name = 'ForeignKeyViolationError';
  }
}

/**
 * Check constraint violation.
 */
export class CheckViolationError extends SqlServerError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: SqlServerErrorCode.CheckViolation,
      errorNumber: SqlServerErrorNumber.CheckConstraint,
      message: table
        ? `Check constraint violated: ${constraint} on table ${table}`
        : `Check constraint violated: ${constraint}`,
      retryable: false,
      details: { constraint, table, detail },
    });
    this.name = 'CheckViolationError';
  }
}

/**
 * NOT NULL constraint violation.
 */
export class NullViolationError extends SqlServerError {
  constructor(column: string, table?: string) {
    super({
      code: SqlServerErrorCode.NullViolation,
      errorNumber: SqlServerErrorNumber.NullConstraint,
      message: table
        ? `Cannot insert NULL into column ${column} in table ${table}`
        : `Cannot insert NULL into column ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'NullViolationError';
  }
}

// ============================================================================
// Object Errors (Non-Retryable)
// ============================================================================

/**
 * Object does not exist.
 */
export class ObjectNotFoundError extends SqlServerError {
  constructor(objectName: string) {
    super({
      code: SqlServerErrorCode.ObjectNotFound,
      errorNumber: SqlServerErrorNumber.InvalidObjectName,
      message: `Object does not exist: ${objectName}`,
      retryable: false,
      details: { objectName },
    });
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Column does not exist.
 */
export class ColumnNotFoundError extends SqlServerError {
  constructor(column: string, table?: string) {
    super({
      code: SqlServerErrorCode.ColumnNotFound,
      errorNumber: SqlServerErrorNumber.InvalidColumnName,
      message: table
        ? `Column does not exist: ${column} in table ${table}`
        : `Column does not exist: ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'ColumnNotFoundError';
  }
}

/**
 * Invalid object name.
 */
export class InvalidObjectNameError extends SqlServerError {
  constructor(objectName: string, reason?: string) {
    super({
      code: SqlServerErrorCode.InvalidObjectName,
      errorNumber: SqlServerErrorNumber.InvalidObjectName,
      message: reason
        ? `Invalid object name '${objectName}': ${reason}`
        : `Invalid object name: ${objectName}`,
      retryable: false,
      details: { objectName, reason },
    });
    this.name = 'InvalidObjectNameError';
  }
}

// ============================================================================
// Syntax and Permission Errors (Non-Retryable)
// ============================================================================

/**
 * SQL syntax error.
 */
export class SyntaxError extends SqlServerError {
  constructor(message: string, lineNumber?: number) {
    super({
      code: SqlServerErrorCode.SyntaxError,
      errorNumber: SqlServerErrorNumber.SyntaxError,
      message: `SQL syntax error: ${message}`,
      retryable: false,
      details: lineNumber ? { lineNumber } : undefined,
    });
    this.name = 'SyntaxError';
  }
}

/**
 * Permission denied.
 */
export class PermissionDeniedError extends SqlServerError {
  constructor(operation: string, object?: string) {
    super({
      code: SqlServerErrorCode.PermissionDenied,
      errorNumber: SqlServerErrorNumber.PermissionDenied,
      message: object
        ? `Permission denied to ${operation} on ${object}`
        : `Permission denied to ${operation}`,
      retryable: false,
      details: { operation, object },
    });
    this.name = 'PermissionDeniedError';
  }
}

// ============================================================================
// Protocol Errors (Non-Retryable)
// ============================================================================

/**
 * Protocol error.
 */
export class ProtocolError extends SqlServerError {
  constructor(message: string) {
    super({
      code: SqlServerErrorCode.ProtocolError,
      message: `Protocol error: ${message}`,
      retryable: false,
    });
    this.name = 'ProtocolError';
  }
}

/**
 * Invalid response from SQL Server.
 */
export class InvalidResponseError extends SqlServerError {
  constructor(message: string) {
    super({
      code: SqlServerErrorCode.InvalidResponse,
      message: `Invalid response from server: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidResponseError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * Simulation mismatch.
 */
export class SimulationMismatchError extends SqlServerError {
  constructor(query: string, expectedQuery?: string) {
    super({
      code: SqlServerErrorCode.SimulationMismatch,
      message: 'Simulation mismatch: query does not match recording',
      retryable: false,
      details: { query, expectedQuery },
    });
    this.name = 'SimulationMismatchError';
  }
}

/**
 * Simulated error for testing.
 */
export class SimulatedError extends SqlServerError {
  constructor(errorType: string, message: string) {
    super({
      code: SqlServerErrorCode.SimulatedError,
      message: `Simulated ${errorType}: ${message}`,
      retryable: false,
      details: { errorType },
    });
    this.name = 'SimulatedError';
  }
}

/**
 * Simulation recording not found.
 */
export class RecordingNotFoundError extends SqlServerError {
  constructor(recordingPath: string) {
    super({
      code: SqlServerErrorCode.RecordingNotFound,
      message: `Simulation recording not found: ${recordingPath}`,
      retryable: false,
      details: { recordingPath },
    });
    this.name = 'RecordingNotFoundError';
  }
}

// ============================================================================
// Circuit Breaker Errors
// ============================================================================

/**
 * Circuit breaker is open.
 */
export class CircuitBreakerOpenError extends SqlServerError {
  constructor(resetTimeMs: number) {
    super({
      code: SqlServerErrorCode.CircuitBreakerOpen,
      message: 'Circuit breaker is open, rejecting requests',
      retryable: false,
      details: { resetTimeMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Maps SQL Server error numbers to appropriate error classes.
 */
export function parseSqlServerError(
  sqlError: SqlServerErrorResponse | Error
): SqlServerError {
  // Handle non-SQL Server errors
  if (!(sqlError && typeof sqlError === 'object' && 'number' in sqlError)) {
    if (sqlError instanceof Error) {
      return new ExecutionError(sqlError.message, undefined, sqlError);
    }
    return new ExecutionError(String(sqlError));
  }

  const error = sqlError as SqlServerErrorResponse;
  const errorNumber = error.number;
  const message = error.message ?? 'Unknown error';

  // Map error numbers to error types
  switch (errorNumber) {
    // Login errors
    case SqlServerErrorNumber.LoginFailed:
      return new LoginFailedError('unknown', message);

    case SqlServerErrorNumber.PasswordExpired:
      return new PasswordExpiredError('unknown');

    // Connection errors
    case SqlServerErrorNumber.ServerNotFound:
    case SqlServerErrorNumber.NetworkError:
    case SqlServerErrorNumber.ConnectionBroken:
      return new NetworkError(message);

    // Permission errors
    case SqlServerErrorNumber.PermissionDenied:
    case SqlServerErrorNumber.ObjectPermissionDenied:
      return new PermissionDeniedError(message);

    // Object errors
    case SqlServerErrorNumber.InvalidObjectName:
      return new ObjectNotFoundError(message);

    case SqlServerErrorNumber.InvalidColumnName:
      return new ColumnNotFoundError(message);

    // Syntax errors
    case SqlServerErrorNumber.SyntaxError:
    case SqlServerErrorNumber.IncorrectSyntax:
      return new SyntaxError(message, error.lineNumber);

    // Constraint violations
    case SqlServerErrorNumber.UniqueConstraint:
    case SqlServerErrorNumber.UniqueIndex:
      return new UniqueViolationError('unknown', undefined, message);

    case SqlServerErrorNumber.NullConstraint:
      return new NullViolationError('unknown');

    // Transaction/Locking errors
    case SqlServerErrorNumber.Deadlock:
      return new DeadlockDetectedError();

    case SqlServerErrorNumber.LockTimeout:
      return new LockTimeoutError();

    case SqlServerErrorNumber.TransactionAborted:
      return new TransactionAbortedError(message);

    case SqlServerErrorNumber.SnapshotConflict:
      return new SnapshotIsolationConflictError();

    // Type conversion errors
    case SqlServerErrorNumber.ConversionFailed:
      return new ConversionError('unknown', 'unknown', message);

    case SqlServerErrorNumber.ArithmeticOverflow:
      return new ArithmeticOverflowError('unknown', 'unknown');

    case SqlServerErrorNumber.StringTruncation:
      return new StringTruncationError('unknown', 0);

    case SqlServerErrorNumber.DateTimeOverflow:
      return new ConversionError('datetime', 'unknown', message);

    // Timeout
    case SqlServerErrorNumber.QueryTimeout:
      return new QueryTimeoutError(0);

    default:
      // Check severity for categorization
      if (error.class && error.class >= 20) {
        // Fatal errors (severity 20+) - connection issues
        return new ConnectionFailedError('unknown', 1433, sqlError as Error);
      }
      if (error.class && error.class >= 16) {
        // User-correctable errors
        return new ExecutionError(message, errorNumber);
      }
      return new ExecutionError(message, errorNumber);
  }
}

/**
 * Checks if an error is a SQL Server error.
 */
export function isSqlServerError(error: unknown): error is SqlServerError {
  return error instanceof SqlServerError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isSqlServerError(error)) {
    return error.retryable;
  }
  // Network errors are typically retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('network') ||
      message.includes('socket')
    );
  }
  return false;
}

/**
 * Gets retry delay from error, if applicable.
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isSqlServerError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Extracts constraint name from error details.
 */
export function getConstraintName(error: SqlServerError): string | undefined {
  return error.details?.constraint as string | undefined;
}

/**
 * Extracts table name from error details.
 */
export function getTableName(error: SqlServerError): string | undefined {
  return error.details?.table as string | undefined;
}

/**
 * Extracts column name from error details.
 */
export function getColumnName(error: SqlServerError): string | undefined {
  return error.details?.column as string | undefined;
}
