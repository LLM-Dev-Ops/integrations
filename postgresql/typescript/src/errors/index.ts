/**
 * PostgreSQL error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps PostgreSQL error codes (SQLSTATE) to appropriate error types.
 */

/**
 * PostgreSQL error codes (SQLSTATE values and custom codes).
 */
export enum PgErrorCode {
  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoCredentials = 'NO_CREDENTIALS',
  InvalidConnectionString = 'INVALID_CONNECTION_STRING',

  // Connection errors
  ConnectionFailed = 'CONNECTION_FAILED',
  AcquireTimeout = 'ACQUIRE_TIMEOUT',
  PoolExhausted = 'POOL_EXHAUSTED',
  TlsError = 'TLS_ERROR',

  // Authentication errors
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  InvalidPassword = 'INVALID_PASSWORD',
  InvalidAuthorizationSpec = 'INVALID_AUTHORIZATION_SPEC',

  // Query errors
  ExecutionError = 'EXECUTION_ERROR',
  NoRows = 'NO_ROWS',
  TooManyRows = 'TOO_MANY_ROWS',
  QueryTimeout = 'QUERY_TIMEOUT',
  ParamCountMismatch = 'PARAM_COUNT_MISMATCH',
  QueryCanceled = 'QUERY_CANCELED',

  // Transaction errors
  SerializationFailure = 'SERIALIZATION_FAILURE',
  DeadlockDetected = 'DEADLOCK_DETECTED',
  TransactionAborted = 'TRANSACTION_ABORTED',
  InvalidSavepoint = 'INVALID_SAVEPOINT',
  TransactionRollback = 'TRANSACTION_ROLLBACK',

  // Type errors
  UnsupportedType = 'UNSUPPORTED_TYPE',
  ConversionError = 'CONVERSION_ERROR',
  NullValue = 'NULL_VALUE',
  InvalidJson = 'INVALID_JSON',
  NumericValueOutOfRange = 'NUMERIC_VALUE_OUT_OF_RANGE',

  // Constraint violations
  UniqueViolation = 'UNIQUE_VIOLATION',
  ForeignKeyViolation = 'FOREIGN_KEY_VIOLATION',
  CheckViolation = 'CHECK_VIOLATION',
  NotNullViolation = 'NOT_NULL_VIOLATION',

  // Object errors
  UndefinedTable = 'UNDEFINED_TABLE',
  UndefinedColumn = 'UNDEFINED_COLUMN',
  UndefinedFunction = 'UNDEFINED_FUNCTION',
  InvalidIdentifier = 'INVALID_IDENTIFIER',

  // Syntax errors
  SyntaxError = 'SYNTAX_ERROR',
  InsufficientPrivilege = 'INSUFFICIENT_PRIVILEGE',

  // Protocol errors
  UnexpectedMessage = 'UNEXPECTED_MESSAGE',
  InvalidResponse = 'INVALID_RESPONSE',
  ProtocolVersionMismatch = 'PROTOCOL_VERSION_MISMATCH',

  // Simulation errors
  SimulationMismatch = 'SIMULATION_MISMATCH',
  SimulatedError = 'SIMULATED_ERROR',
  RecordingNotFound = 'RECORDING_NOT_FOUND',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',
}

/**
 * PostgreSQL SQLSTATE error codes.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export enum SqlState {
  // Class 08 - Connection Exception
  ConnectionException = '08000',
  ConnectionDoesNotExist = '08003',
  ConnectionFailure = '08006',
  SqlClientUnableToEstablishSqlConnection = '08001',
  SqlServerRejectedEstablishmentOfSqlConnection = '08004',
  TransactionResolutionUnknown = '08007',
  ProtocolViolation = '08P01',

  // Class 28 - Invalid Authorization Specification
  InvalidAuthorizationSpecification = '28000',
  InvalidPassword = '28P01',

  // Class 42 - Syntax Error or Access Rule Violation
  SyntaxError = '42601',
  InsufficientPrivilege = '42501',
  UndefinedTable = '42P01',
  UndefinedColumn = '42703',
  UndefinedFunction = '42883',
  DuplicateColumn = '42701',
  AmbiguousColumn = '42702',

  // Class 23 - Integrity Constraint Violation
  IntegrityConstraintViolation = '23000',
  NotNullViolation = '23502',
  ForeignKeyViolation = '23503',
  UniqueViolation = '23505',
  CheckViolation = '23514',

  // Class 40 - Transaction Rollback
  TransactionRollback = '40000',
  SerializationFailure = '40001',
  DeadlockDetected = '40P01',

  // Class 57 - Operator Intervention
  QueryCanceled = '57014',
  AdminShutdown = '57P01',
  CrashShutdown = '57P02',
  CannotConnectNow = '57P03',

  // Class 22 - Data Exception
  DataException = '22000',
  NumericValueOutOfRange = '22003',
  InvalidTextRepresentation = '22P02',
  InvalidJsonText = '22P05',
  FloatingPointException = '22P01',
  InvalidParameterValue = '22023',

  // Class 25 - Invalid Transaction State
  InvalidTransactionState = '25000',
  ActiveSqlTransaction = '25001',
  NoActiveSqlTransaction = '25P01',
  InFailedSqlTransaction = '25P02',

  // Class 3B - Savepoint Exception
  SavepointException = '3B000',
  InvalidSavepointSpecification = '3B001',
}

/**
 * PostgreSQL error response structure from pg driver.
 */
export interface PgErrorResponse {
  /** SQLSTATE error code */
  code?: string;
  /** Error message */
  message?: string;
  /** Severity (ERROR, FATAL, PANIC, WARNING, etc.) */
  severity?: string;
  /** Table name (for constraint violations) */
  table?: string;
  /** Column name (for constraint violations) */
  column?: string;
  /** Constraint name (for constraint violations) */
  constraint?: string;
  /** Data type name (for type errors) */
  dataType?: string;
  /** Schema name */
  schema?: string;
  /** File name in PostgreSQL source */
  file?: string;
  /** Line number in PostgreSQL source */
  line?: string;
  /** Routine name in PostgreSQL source */
  routine?: string;
  /** Position in query where error occurred */
  position?: string;
  /** Internal position */
  internalPosition?: string;
  /** Internal query */
  internalQuery?: string;
  /** Where (context) */
  where?: string;
  /** Detail message */
  detail?: string;
  /** Hint message */
  hint?: string;
}

/**
 * Base PostgreSQL error class.
 */
export class PgError extends Error {
  /** Error code */
  readonly code: PgErrorCode;
  /** SQLSTATE code (if from PostgreSQL) */
  readonly sqlState?: string;
  /** HTTP-like status code for API responses */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: PgErrorCode;
    message: string;
    sqlState?: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'PgError';
    this.code = options.code;
    this.sqlState = options.sqlState;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;

    // Manually set cause for compatibility
    if (options.cause) {
      (this as any).cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PgError);
    }
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      sqlState: this.sqlState,
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
export class ConfigurationError extends PgError {
  constructor(message: string) {
    super({
      code: PgErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No credentials configured.
 */
export class NoCredentialsError extends PgError {
  constructor() {
    super({
      code: PgErrorCode.NoCredentials,
      message: 'No database credentials configured',
      retryable: false,
    });
    this.name = 'NoCredentialsError';
  }
}

/**
 * Invalid connection string format.
 */
export class InvalidConnectionStringError extends PgError {
  constructor(connectionString: string, reason?: string) {
    super({
      code: PgErrorCode.InvalidConnectionString,
      message: reason
        ? `Invalid connection string: ${reason}`
        : 'Invalid connection string format',
      retryable: false,
      details: { connectionString: connectionString.replace(/:[^:@]+@/, ':***@') },
    });
    this.name = 'InvalidConnectionStringError';
  }
}

// ============================================================================
// Connection Errors (Conditionally Retryable)
// ============================================================================

/**
 * Connection to PostgreSQL failed.
 */
export class ConnectionFailedError extends PgError {
  constructor(host: string, port: number, cause?: Error) {
    super({
      code: PgErrorCode.ConnectionFailed,
      message: `Failed to connect to PostgreSQL at ${host}:${port}`,
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
export class AcquireTimeoutError extends PgError {
  constructor(timeoutMs: number) {
    super({
      code: PgErrorCode.AcquireTimeout,
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
export class PoolExhaustedError extends PgError {
  constructor(maxSize: number) {
    super({
      code: PgErrorCode.PoolExhausted,
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
export class TlsError extends PgError {
  constructor(message: string, cause?: Error) {
    super({
      code: PgErrorCode.TlsError,
      message: `TLS error: ${message}`,
      retryable: false,
      cause,
    });
    this.name = 'TlsError';
  }
}

// ============================================================================
// Authentication Errors (Non-Retryable)
// ============================================================================

/**
 * Authentication failed.
 */
export class AuthenticationFailedError extends PgError {
  constructor(user?: string, cause?: Error) {
    super({
      code: PgErrorCode.AuthenticationFailed,
      sqlState: SqlState.InvalidAuthorizationSpecification,
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
 * Invalid password.
 */
export class InvalidPasswordError extends PgError {
  constructor(user: string) {
    super({
      code: PgErrorCode.InvalidPassword,
      sqlState: SqlState.InvalidPassword,
      message: `Invalid password for user: ${user}`,
      retryable: false,
      details: { user },
    });
    this.name = 'InvalidPasswordError';
  }
}

// ============================================================================
// Query Errors (Mostly Non-Retryable)
// ============================================================================

/**
 * Query execution error.
 */
export class ExecutionError extends PgError {
  constructor(message: string, sqlState?: string, cause?: Error) {
    super({
      code: PgErrorCode.ExecutionError,
      message: `Query execution failed: ${message}`,
      sqlState,
      retryable: false,
      cause,
    });
    this.name = 'ExecutionError';
  }
}

/**
 * Query returned no rows when at least one was expected.
 */
export class NoRowsError extends PgError {
  constructor() {
    super({
      code: PgErrorCode.NoRows,
      message: 'Query returned no rows',
      retryable: false,
    });
    this.name = 'NoRowsError';
  }
}

/**
 * Query returned too many rows when only one was expected.
 */
export class TooManyRowsError extends PgError {
  constructor(count: number) {
    super({
      code: PgErrorCode.TooManyRows,
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
export class QueryTimeoutError extends PgError {
  constructor(timeoutMs: number) {
    super({
      code: PgErrorCode.QueryTimeout,
      message: `Query timeout after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Parameter count mismatch between SQL placeholders and provided params.
 */
export class ParamCountMismatchError extends PgError {
  constructor(expected: number, got: number) {
    super({
      code: PgErrorCode.ParamCountMismatch,
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
export class QueryCanceledError extends PgError {
  constructor(reason?: string) {
    super({
      code: PgErrorCode.QueryCanceled,
      sqlState: SqlState.QueryCanceled,
      message: reason ? `Query canceled: ${reason}` : 'Query was canceled',
      retryable: false,
      details: reason ? { reason } : undefined,
    });
    this.name = 'QueryCanceledError';
  }
}

// ============================================================================
// Transaction Errors (Retryable for Serialization Issues)
// ============================================================================

/**
 * Transaction serialization failure - should be retried.
 */
export class SerializationFailureError extends PgError {
  constructor() {
    super({
      code: PgErrorCode.SerializationFailure,
      sqlState: SqlState.SerializationFailure,
      message: 'Transaction serialization failure, should be retried',
      retryable: true,
    });
    this.name = 'SerializationFailureError';
  }
}

/**
 * Deadlock detected - should be retried.
 */
export class DeadlockDetectedError extends PgError {
  constructor() {
    super({
      code: PgErrorCode.DeadlockDetected,
      sqlState: SqlState.DeadlockDetected,
      message: 'Deadlock detected, should be retried',
      retryable: true,
    });
    this.name = 'DeadlockDetectedError';
  }
}

/**
 * Transaction was aborted.
 */
export class TransactionAbortedError extends PgError {
  constructor(reason?: string) {
    super({
      code: PgErrorCode.TransactionAborted,
      sqlState: SqlState.InFailedSqlTransaction,
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
export class InvalidSavepointError extends PgError {
  constructor(savepoint: string, reason?: string) {
    super({
      code: PgErrorCode.InvalidSavepoint,
      sqlState: SqlState.InvalidSavepointSpecification,
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
export class TransactionRollbackError extends PgError {
  constructor(message: string, sqlState?: string) {
    super({
      code: PgErrorCode.TransactionRollback,
      sqlState: sqlState ?? SqlState.TransactionRollback,
      message: `Transaction rollback: ${message}`,
      retryable: false,
    });
    this.name = 'TransactionRollbackError';
  }
}

// ============================================================================
// Type Errors (Non-Retryable)
// ============================================================================

/**
 * Unsupported PostgreSQL type.
 */
export class UnsupportedTypeError extends PgError {
  constructor(pgType: string | number) {
    super({
      code: PgErrorCode.UnsupportedType,
      message: `Unsupported PostgreSQL type: ${pgType}`,
      retryable: false,
      details: { pgType },
    });
    this.name = 'UnsupportedTypeError';
  }
}

/**
 * Type conversion error.
 */
export class ConversionError extends PgError {
  constructor(fromType: string, toType: string, value?: unknown) {
    super({
      code: PgErrorCode.ConversionError,
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
export class NullValueError extends PgError {
  constructor(column: string) {
    super({
      code: PgErrorCode.NullValue,
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
export class InvalidJsonError extends PgError {
  constructor(message: string) {
    super({
      code: PgErrorCode.InvalidJson,
      sqlState: SqlState.InvalidJsonText,
      message: `Invalid JSON: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidJsonError';
  }
}

/**
 * Numeric value out of range.
 */
export class NumericValueOutOfRangeError extends PgError {
  constructor(value: unknown, type: string) {
    super({
      code: PgErrorCode.NumericValueOutOfRange,
      sqlState: SqlState.NumericValueOutOfRange,
      message: `Numeric value out of range for type ${type}`,
      retryable: false,
      details: { value, type },
    });
    this.name = 'NumericValueOutOfRangeError';
  }
}

// ============================================================================
// Constraint Violation Errors (Non-Retryable)
// ============================================================================

/**
 * Unique constraint violation.
 */
export class UniqueViolationError extends PgError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: PgErrorCode.UniqueViolation,
      sqlState: SqlState.UniqueViolation,
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
 * Foreign key constraint violation.
 */
export class ForeignKeyViolationError extends PgError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: PgErrorCode.ForeignKeyViolation,
      sqlState: SqlState.ForeignKeyViolation,
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
export class CheckViolationError extends PgError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: PgErrorCode.CheckViolation,
      sqlState: SqlState.CheckViolation,
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
export class NotNullViolationError extends PgError {
  constructor(column: string, table?: string) {
    super({
      code: PgErrorCode.NotNullViolation,
      sqlState: SqlState.NotNullViolation,
      message: table
        ? `NOT NULL constraint violated: column ${column} in table ${table}`
        : `NOT NULL constraint violated: column ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'NotNullViolationError';
  }
}

// ============================================================================
// Object Errors (Non-Retryable)
// ============================================================================

/**
 * Table does not exist.
 */
export class UndefinedTableError extends PgError {
  constructor(table: string) {
    super({
      code: PgErrorCode.UndefinedTable,
      sqlState: SqlState.UndefinedTable,
      message: `Table does not exist: ${table}`,
      retryable: false,
      details: { table },
    });
    this.name = 'UndefinedTableError';
  }
}

/**
 * Column does not exist.
 */
export class UndefinedColumnError extends PgError {
  constructor(column: string, table?: string) {
    super({
      code: PgErrorCode.UndefinedColumn,
      sqlState: SqlState.UndefinedColumn,
      message: table
        ? `Column does not exist: ${column} in table ${table}`
        : `Column does not exist: ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'UndefinedColumnError';
  }
}

/**
 * Function does not exist.
 */
export class UndefinedFunctionError extends PgError {
  constructor(functionName: string) {
    super({
      code: PgErrorCode.UndefinedFunction,
      sqlState: SqlState.UndefinedFunction,
      message: `Function does not exist: ${functionName}`,
      retryable: false,
      details: { functionName },
    });
    this.name = 'UndefinedFunctionError';
  }
}

/**
 * Invalid SQL identifier.
 */
export class InvalidIdentifierError extends PgError {
  constructor(identifier: string, reason?: string) {
    super({
      code: PgErrorCode.InvalidIdentifier,
      message: reason
        ? `Invalid identifier '${identifier}': ${reason}`
        : `Invalid identifier: ${identifier}`,
      retryable: false,
      details: { identifier, reason },
    });
    this.name = 'InvalidIdentifierError';
  }
}

// ============================================================================
// Syntax and Permission Errors (Non-Retryable)
// ============================================================================

/**
 * SQL syntax error.
 */
export class SyntaxError extends PgError {
  constructor(message: string, position?: number) {
    super({
      code: PgErrorCode.SyntaxError,
      sqlState: SqlState.SyntaxError,
      message: `SQL syntax error: ${message}`,
      retryable: false,
      details: position ? { position } : undefined,
    });
    this.name = 'SyntaxError';
  }
}

/**
 * Insufficient privilege to perform operation.
 */
export class InsufficientPrivilegeError extends PgError {
  constructor(operation: string, object?: string) {
    super({
      code: PgErrorCode.InsufficientPrivilege,
      sqlState: SqlState.InsufficientPrivilege,
      message: object
        ? `Insufficient privilege to ${operation} on ${object}`
        : `Insufficient privilege to ${operation}`,
      retryable: false,
      details: { operation, object },
    });
    this.name = 'InsufficientPrivilegeError';
  }
}

// ============================================================================
// Protocol Errors (Non-Retryable)
// ============================================================================

/**
 * Unexpected message from PostgreSQL server.
 */
export class UnexpectedMessageError extends PgError {
  constructor(message: string) {
    super({
      code: PgErrorCode.UnexpectedMessage,
      message: `Unexpected message from server: ${message}`,
      retryable: false,
    });
    this.name = 'UnexpectedMessageError';
  }
}

/**
 * Invalid response from PostgreSQL server.
 */
export class InvalidResponseError extends PgError {
  constructor(message: string) {
    super({
      code: PgErrorCode.InvalidResponse,
      message: `Invalid response from server: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidResponseError';
  }
}

/**
 * Protocol version mismatch.
 */
export class ProtocolVersionMismatchError extends PgError {
  constructor(clientVersion: number, serverVersion: number) {
    super({
      code: PgErrorCode.ProtocolVersionMismatch,
      message: `Protocol version mismatch: client=${clientVersion}, server=${serverVersion}`,
      retryable: false,
      details: { clientVersion, serverVersion },
    });
    this.name = 'ProtocolVersionMismatchError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * Simulation mismatch - query doesn't match recording.
 */
export class SimulationMismatchError extends PgError {
  constructor(query: string, expectedQuery?: string) {
    super({
      code: PgErrorCode.SimulationMismatch,
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
export class SimulatedError extends PgError {
  constructor(errorType: string, message: string) {
    super({
      code: PgErrorCode.SimulatedError,
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
export class RecordingNotFoundError extends PgError {
  constructor(recordingPath: string) {
    super({
      code: PgErrorCode.RecordingNotFound,
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
export class CircuitBreakerOpenError extends PgError {
  constructor(resetTimeMs: number) {
    super({
      code: PgErrorCode.CircuitBreakerOpen,
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
 * Maps PostgreSQL error codes (SQLSTATE) to appropriate error classes.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function parsePostgresError(
  pgError: PgErrorResponse | Error
): PgError {
  // Handle non-pg errors
  if (!(pgError && typeof pgError === 'object' && 'code' in pgError)) {
    if (pgError instanceof Error) {
      return new ExecutionError(pgError.message, undefined, pgError);
    }
    return new ExecutionError(String(pgError));
  }

  const error = pgError as PgErrorResponse;
  const sqlState = error.code;
  const message = error.message ?? 'Unknown error';
  const detail = error.detail;
  const constraint = error.constraint;
  const table = error.table;
  const column = error.column;

  // Map SQLSTATE to error types
  switch (sqlState) {
    // Connection errors (Class 08)
    case SqlState.ConnectionException:
    case SqlState.ConnectionFailure:
    case SqlState.SqlClientUnableToEstablishSqlConnection:
      return new ConnectionFailedError('unknown', 5432, pgError as Error);

    case SqlState.SqlServerRejectedEstablishmentOfSqlConnection:
      return new AuthenticationFailedError(undefined, pgError as Error);

    case SqlState.ProtocolViolation:
      return new UnexpectedMessageError(message);

    // Authentication errors (Class 28)
    case SqlState.InvalidAuthorizationSpecification:
      return new AuthenticationFailedError();

    case SqlState.InvalidPassword:
      return new InvalidPasswordError('unknown');

    // Syntax errors (Class 42)
    case SqlState.SyntaxError:
      return new SyntaxError(
        message,
        error.position ? parseInt(error.position, 10) : undefined
      );

    case SqlState.InsufficientPrivilege:
      return new InsufficientPrivilegeError(message, table);

    case SqlState.UndefinedTable:
      return new UndefinedTableError(table ?? message);

    case SqlState.UndefinedColumn:
      return new UndefinedColumnError(column ?? message, table);

    case SqlState.UndefinedFunction:
      return new UndefinedFunctionError(message);

    // Constraint violations (Class 23)
    case SqlState.NotNullViolation:
      return new NotNullViolationError(column ?? 'unknown', table);

    case SqlState.ForeignKeyViolation:
      return new ForeignKeyViolationError(
        constraint ?? 'unknown',
        table,
        detail
      );

    case SqlState.UniqueViolation:
      return new UniqueViolationError(constraint ?? 'unknown', table, detail);

    case SqlState.CheckViolation:
      return new CheckViolationError(constraint ?? 'unknown', table, detail);

    // Transaction errors (Class 40)
    case SqlState.SerializationFailure:
      return new SerializationFailureError();

    case SqlState.DeadlockDetected:
      return new DeadlockDetectedError();

    case SqlState.TransactionRollback:
      return new TransactionRollbackError(message, sqlState);

    // Query cancellation (Class 57)
    case SqlState.QueryCanceled:
      return new QueryCanceledError(message);

    // Data exceptions (Class 22)
    case SqlState.NumericValueOutOfRange:
      return new NumericValueOutOfRangeError('unknown', error.dataType ?? 'unknown');

    case SqlState.InvalidJsonText:
      return new InvalidJsonError(message);

    case SqlState.InvalidTextRepresentation:
      return new ConversionError(
        error.dataType ?? 'unknown',
        'text',
        message
      );

    // Transaction state errors (Class 25)
    case SqlState.InFailedSqlTransaction:
      return new TransactionAbortedError(message);

    case SqlState.NoActiveSqlTransaction:
      return new TransactionAbortedError('No active transaction');

    // Savepoint errors (Class 3B)
    case SqlState.InvalidSavepointSpecification:
      return new InvalidSavepointError('unknown', message);

    // Default
    default:
      // Check error class (first 2 characters of SQLSTATE)
      if (sqlState) {
        const errorClass = sqlState.substring(0, 2);

        switch (errorClass) {
          case '08': // Connection Exception
            return new ConnectionFailedError('unknown', 5432, pgError as Error);
          case '28': // Invalid Authorization
            return new AuthenticationFailedError();
          case '42': // Syntax Error or Access Rule Violation
            return new SyntaxError(message);
          case '23': // Integrity Constraint Violation
            return new ExecutionError(message, sqlState);
          case '40': // Transaction Rollback
            return new TransactionRollbackError(message, sqlState);
          case '22': // Data Exception
            return new ConversionError('unknown', 'unknown', message);
          case '25': // Invalid Transaction State
            return new TransactionAbortedError(message);
        }
      }

      return new ExecutionError(message, sqlState);
  }
}

/**
 * Checks if an error is a PostgreSQL error.
 */
export function isPgError(error: unknown): error is PgError {
  return error instanceof PgError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isPgError(error)) {
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
      message.includes('network')
    );
  }
  return false;
}

/**
 * Gets retry delay from error, if applicable.
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isPgError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Extracts constraint name from error details.
 */
export function getConstraintName(error: PgError): string | undefined {
  return error.details?.constraint as string | undefined;
}

/**
 * Extracts table name from error details.
 */
export function getTableName(error: PgError): string | undefined {
  return error.details?.table as string | undefined;
}

/**
 * Extracts column name from error details.
 */
export function getColumnName(error: PgError): string | undefined {
  return error.details?.column as string | undefined;
}
