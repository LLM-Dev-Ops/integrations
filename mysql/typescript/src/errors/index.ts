/**
 * MySQL error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps MySQL error codes to appropriate error types.
 */

/**
 * MySQL error codes (numeric error codes).
 * See: https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
 */
export enum MysqlErrorCode {
  // Configuration errors (custom)
  ConfigurationError = 'CONFIGURATION_ERROR',
  NoCredentials = 'NO_CREDENTIALS',
  InvalidConnectionString = 'INVALID_CONNECTION_STRING',

  // Connection errors
  ConnectionRefused = 2003, // CR_CONNECTION_ERROR
  TooManyConnections = 1040, // ER_CON_COUNT_ERROR
  ConnectionLost = 2013, // CR_SERVER_LOST
  ServerGone = 2006, // CR_SERVER_GONE_ERROR
  HandshakeError = 1043, // ER_HANDSHAKE_ERROR
  AcquireTimeout = 'ACQUIRE_TIMEOUT',
  PoolExhausted = 'POOL_EXHAUSTED',
  TlsError = 'TLS_ERROR',

  // Authentication errors
  AuthenticationFailed = 1045, // ER_ACCESS_DENIED_ERROR
  AccessDenied = 1142, // ER_TABLEACCESS_DENIED_ERROR
  InvalidPassword = 1045, // ER_ACCESS_DENIED_ERROR

  // Database/Schema errors
  DatabaseNotFound = 1049, // ER_BAD_DB_ERROR
  TableNotFound = 1146, // ER_NO_SUCH_TABLE
  ColumnNotFound = 1054, // ER_BAD_FIELD_ERROR
  UnknownColumn = 1054, // ER_BAD_FIELD_ERROR

  // Query errors
  ExecutionError = 'EXECUTION_ERROR',
  SyntaxError = 1064, // ER_PARSE_ERROR
  NoRows = 'NO_ROWS',
  TooManyRows = 'TOO_MANY_ROWS',
  QueryTimeout = 'QUERY_TIMEOUT',
  ParamCountMismatch = 'PARAM_COUNT_MISMATCH',
  QueryInterrupted = 1317, // ER_QUERY_INTERRUPTED

  // Constraint violations
  DuplicateKey = 1062, // ER_DUP_ENTRY
  ForeignKeyViolation = 1451, // ER_ROW_IS_REFERENCED_2
  ForeignKeyConstraintFails = 1452, // ER_NO_REFERENCED_ROW_2
  DataTooLong = 1406, // ER_DATA_TOO_LONG
  NotNullViolation = 1048, // ER_BAD_NULL_ERROR
  OutOfRange = 1264, // ER_WARN_DATA_OUT_OF_RANGE

  // Transaction errors
  DeadlockDetected = 1213, // ER_LOCK_DEADLOCK
  LockWaitTimeout = 1205, // ER_LOCK_WAIT_TIMEOUT
  TransactionAborted = 1180, // ER_ERROR_DURING_ROLLBACK
  ReadOnlyTransaction = 1792, // ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION
  TransactionRollback = 'TRANSACTION_ROLLBACK',
  SerializationFailure = 'SERIALIZATION_FAILURE',

  // Type errors
  UnsupportedType = 'UNSUPPORTED_TYPE',
  ConversionError = 'CONVERSION_ERROR',
  NullValue = 'NULL_VALUE',
  InvalidJson = 3140, // ER_INVALID_JSON_TEXT
  TruncatedWrongValue = 1292, // ER_TRUNCATED_WRONG_VALUE

  // Prepared statement errors
  PreparedStatementNotFound = 1243, // ER_UNKNOWN_STMT_HANDLER
  PreparedStatementError = 'PREPARED_STATEMENT_ERROR',

  // Protocol errors
  UnexpectedMessage = 'UNEXPECTED_MESSAGE',
  InvalidResponse = 'INVALID_RESPONSE',
  ProtocolMismatch = 'PROTOCOL_MISMATCH',

  // Simulation errors
  SimulationMismatch = 'SIMULATION_MISMATCH',
  SimulatedError = 'SIMULATED_ERROR',
  RecordingNotFound = 'RECORDING_NOT_FOUND',

  // Circuit breaker
  CircuitBreakerOpen = 'CIRCUIT_BREAKER_OPEN',

  // Character set / collation errors
  UnknownCharacterSet = 1115, // ER_UNKNOWN_CHARACTER_SET
  CollationMismatch = 1267, // ER_COLLATION_CHARSET_MISMATCH

  // Storage engine errors
  StorageEngineFull = 1114, // ER_RECORD_FILE_FULL
  TableFull = 1114, // ER_RECORD_FILE_FULL
}

/**
 * MySQL error response structure from mysql2 driver.
 */
export interface MysqlErrorResponse {
  /** MySQL error code (numeric) */
  errno?: number;
  /** Error code as string */
  code?: string;
  /** SQLSTATE code */
  sqlState?: string;
  /** SQL state marker */
  sqlStateMarker?: string;
  /** Error message */
  message?: string;
  /** SQL that caused the error */
  sql?: string;
  /** SQL message from server */
  sqlMessage?: string;
  /** Field count */
  fieldCount?: number;
  /** Fatal error flag */
  fatal?: boolean;
}

/**
 * Base MySQL error class.
 */
export class MysqlError extends Error {
  /** Error code */
  readonly code: MysqlErrorCode | number | string;
  /** MySQL error code (numeric) */
  readonly mysqlErrorCode?: number;
  /** SQLSTATE code (if from MySQL) */
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
    code: MysqlErrorCode | number | string;
    message: string;
    mysqlErrorCode?: number;
    sqlState?: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'MysqlError';
    this.code = options.code;
    this.mysqlErrorCode = options.mysqlErrorCode;
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
      Error.captureStackTrace(this, MysqlError);
    }
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      mysqlErrorCode: this.mysqlErrorCode,
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
export class ConfigurationError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * No credentials configured.
 */
export class NoCredentialsError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.NoCredentials,
      message: 'No database credentials configured',
      retryable: false,
    });
    this.name = 'NoCredentialsError';
  }
}

/**
 * Invalid connection string format.
 */
export class InvalidConnectionStringError extends MysqlError {
  constructor(connectionString: string, reason?: string) {
    super({
      code: MysqlErrorCode.InvalidConnectionString,
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
 * Connection to MySQL refused - server not reachable.
 */
export class ConnectionRefusedError extends MysqlError {
  constructor(host: string, port: number, cause?: Error) {
    super({
      code: MysqlErrorCode.ConnectionRefused,
      mysqlErrorCode: 2003,
      message: `Connection refused to MySQL at ${host}:${port}`,
      retryable: true,
      retryAfterMs: 1000,
      details: { host, port },
      cause,
    });
    this.name = 'ConnectionRefusedError';
  }
}

/**
 * Too many connections to MySQL server.
 */
export class TooManyConnectionsError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.TooManyConnections,
      mysqlErrorCode: 1040,
      message: 'Too many connections to MySQL server',
      retryable: true,
      retryAfterMs: 2000,
    });
    this.name = 'TooManyConnectionsError';
  }
}

/**
 * Connection lost during query execution.
 */
export class ConnectionLostError extends MysqlError {
  constructor(cause?: Error) {
    super({
      code: MysqlErrorCode.ConnectionLost,
      mysqlErrorCode: 2013,
      message: 'Lost connection to MySQL server during query',
      retryable: true,
      retryAfterMs: 1000,
      cause,
    });
    this.name = 'ConnectionLostError';
  }
}

/**
 * MySQL server has gone away.
 */
export class ServerGoneError extends MysqlError {
  constructor(cause?: Error) {
    super({
      code: MysqlErrorCode.ServerGone,
      mysqlErrorCode: 2006,
      message: 'MySQL server has gone away',
      retryable: true,
      retryAfterMs: 1000,
      cause,
    });
    this.name = 'ServerGoneError';
  }
}

/**
 * Timeout acquiring connection from pool.
 */
export class AcquireTimeoutError extends MysqlError {
  constructor(timeoutMs: number) {
    super({
      code: MysqlErrorCode.AcquireTimeout,
      message: `Timeout acquiring connection from pool after ${timeoutMs}ms`,
      retryable: true,
      retryAfterMs: 500,
      details: { timeoutMs },
    });
    this.name = 'AcquireTimeoutError';
  }
}

/**
 * Connection pool exhausted.
 */
export class PoolExhaustedError extends MysqlError {
  constructor(maxSize: number) {
    super({
      code: MysqlErrorCode.PoolExhausted,
      message: `Connection pool exhausted (max size: ${maxSize})`,
      retryable: true,
      retryAfterMs: 1000,
      details: { maxSize },
    });
    this.name = 'PoolExhaustedError';
  }
}

/**
 * TLS/SSL connection error.
 */
export class TlsError extends MysqlError {
  constructor(message: string, cause?: Error) {
    super({
      code: MysqlErrorCode.TlsError,
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
 * Authentication failed - access denied.
 */
export class AuthenticationFailedError extends MysqlError {
  constructor(user?: string, host?: string, cause?: Error) {
    super({
      code: MysqlErrorCode.AuthenticationFailed,
      mysqlErrorCode: 1045,
      message: user
        ? `Access denied for user '${user}'${host ? `@'${host}'` : ''}`
        : 'Authentication failed',
      retryable: false,
      details: user ? { user, host } : undefined,
      cause,
    });
    this.name = 'AuthenticationFailedError';
  }
}

/**
 * Access denied for specific table or operation.
 */
export class AccessDeniedError extends MysqlError {
  constructor(operation: string, object?: string) {
    super({
      code: MysqlErrorCode.AccessDenied,
      mysqlErrorCode: 1142,
      message: object
        ? `Access denied for ${operation} on ${object}`
        : `Access denied for ${operation}`,
      retryable: false,
      details: { operation, object },
    });
    this.name = 'AccessDeniedError';
  }
}

// ============================================================================
// Database/Schema Errors (Non-Retryable)
// ============================================================================

/**
 * Database not found.
 */
export class DatabaseNotFoundError extends MysqlError {
  constructor(database: string) {
    super({
      code: MysqlErrorCode.DatabaseNotFound,
      mysqlErrorCode: 1049,
      message: `Unknown database: ${database}`,
      retryable: false,
      details: { database },
    });
    this.name = 'DatabaseNotFoundError';
  }
}

/**
 * Table not found.
 */
export class TableNotFoundError extends MysqlError {
  constructor(table: string) {
    super({
      code: MysqlErrorCode.TableNotFound,
      mysqlErrorCode: 1146,
      message: `Table doesn't exist: ${table}`,
      retryable: false,
      details: { table },
    });
    this.name = 'TableNotFoundError';
  }
}

/**
 * Column not found.
 */
export class ColumnNotFoundError extends MysqlError {
  constructor(column: string, table?: string) {
    super({
      code: MysqlErrorCode.ColumnNotFound,
      mysqlErrorCode: 1054,
      message: table
        ? `Unknown column '${column}' in table '${table}'`
        : `Unknown column: ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'ColumnNotFoundError';
  }
}

// ============================================================================
// Query Errors (Mostly Non-Retryable)
// ============================================================================

/**
 * Query execution error.
 */
export class ExecutionError extends MysqlError {
  constructor(message: string, mysqlErrorCode?: number, sqlState?: string, cause?: Error) {
    super({
      code: MysqlErrorCode.ExecutionError,
      message: `Query execution failed: ${message}`,
      mysqlErrorCode,
      sqlState,
      retryable: false,
      cause,
    });
    this.name = 'ExecutionError';
  }
}

/**
 * SQL syntax error.
 */
export class SyntaxError extends MysqlError {
  constructor(message: string, sql?: string) {
    super({
      code: MysqlErrorCode.SyntaxError,
      mysqlErrorCode: 1064,
      message: `SQL syntax error: ${message}`,
      retryable: false,
      details: sql ? { sql } : undefined,
    });
    this.name = 'SyntaxError';
  }
}

/**
 * Query returned no rows when at least one was expected.
 */
export class NoRowsError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.NoRows,
      message: 'Query returned no rows',
      retryable: false,
    });
    this.name = 'NoRowsError';
  }
}

/**
 * Query returned too many rows when only one was expected.
 */
export class TooManyRowsError extends MysqlError {
  constructor(count: number) {
    super({
      code: MysqlErrorCode.TooManyRows,
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
export class QueryTimeoutError extends MysqlError {
  constructor(timeoutMs: number) {
    super({
      code: MysqlErrorCode.QueryTimeout,
      message: `Query timeout after ${timeoutMs}ms`,
      retryable: true,
      retryAfterMs: 500,
      details: { timeoutMs },
    });
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Parameter count mismatch between SQL placeholders and provided params.
 */
export class ParamCountMismatchError extends MysqlError {
  constructor(expected: number, got: number) {
    super({
      code: MysqlErrorCode.ParamCountMismatch,
      message: `Parameter count mismatch: expected ${expected}, got ${got}`,
      retryable: false,
      details: { expected, got },
    });
    this.name = 'ParamCountMismatchError';
  }
}

/**
 * Query was interrupted.
 */
export class QueryInterruptedError extends MysqlError {
  constructor(reason?: string) {
    super({
      code: MysqlErrorCode.QueryInterrupted,
      mysqlErrorCode: 1317,
      message: reason ? `Query interrupted: ${reason}` : 'Query was interrupted',
      retryable: false,
      details: reason ? { reason } : undefined,
    });
    this.name = 'QueryInterruptedError';
  }
}

// ============================================================================
// Constraint Violation Errors (Non-Retryable)
// ============================================================================

/**
 * Duplicate key/unique constraint violation.
 */
export class DuplicateKeyError extends MysqlError {
  constructor(key: string, table?: string, detail?: string) {
    super({
      code: MysqlErrorCode.DuplicateKey,
      mysqlErrorCode: 1062,
      message: table
        ? `Duplicate entry for key '${key}' in table '${table}'`
        : `Duplicate entry for key: ${key}`,
      retryable: false,
      details: { key, table, detail },
    });
    this.name = 'DuplicateKeyError';
  }
}

/**
 * Foreign key constraint violation.
 */
export class ForeignKeyViolationError extends MysqlError {
  constructor(constraint: string, table?: string, detail?: string) {
    super({
      code: MysqlErrorCode.ForeignKeyViolation,
      mysqlErrorCode: 1451,
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
 * Data too long for column.
 */
export class DataTooLongError extends MysqlError {
  constructor(column: string, table?: string) {
    super({
      code: MysqlErrorCode.DataTooLong,
      mysqlErrorCode: 1406,
      message: table
        ? `Data too long for column '${column}' in table '${table}'`
        : `Data too long for column: ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'DataTooLongError';
  }
}

/**
 * NOT NULL constraint violation.
 */
export class NotNullViolationError extends MysqlError {
  constructor(column: string, table?: string) {
    super({
      code: MysqlErrorCode.NotNullViolation,
      mysqlErrorCode: 1048,
      message: table
        ? `Column '${column}' cannot be null in table '${table}'`
        : `Column cannot be null: ${column}`,
      retryable: false,
      details: { column, table },
    });
    this.name = 'NotNullViolationError';
  }
}

/**
 * Numeric value out of range.
 */
export class OutOfRangeError extends MysqlError {
  constructor(column: string, value?: unknown) {
    super({
      code: MysqlErrorCode.OutOfRange,
      mysqlErrorCode: 1264,
      message: `Out of range value for column: ${column}`,
      retryable: false,
      details: { column, value },
    });
    this.name = 'OutOfRangeError';
  }
}

// ============================================================================
// Transaction Errors (Retryable for Deadlock/Lock Timeout)
// ============================================================================

/**
 * Deadlock detected - should be retried.
 */
export class DeadlockDetectedError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.DeadlockDetected,
      mysqlErrorCode: 1213,
      message: 'Deadlock detected, should be retried',
      retryable: true,
      retryAfterMs: 100,
    });
    this.name = 'DeadlockDetectedError';
  }
}

/**
 * Lock wait timeout exceeded - should be retried.
 */
export class LockWaitTimeoutError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.LockWaitTimeout,
      mysqlErrorCode: 1205,
      message: 'Lock wait timeout exceeded, should be retried',
      retryable: true,
      retryAfterMs: 500,
    });
    this.name = 'LockWaitTimeoutError';
  }
}

/**
 * Transaction was aborted.
 */
export class TransactionAbortedError extends MysqlError {
  constructor(reason?: string) {
    super({
      code: MysqlErrorCode.TransactionAborted,
      mysqlErrorCode: 1180,
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
 * Cannot execute statement in read-only transaction.
 */
export class ReadOnlyTransactionError extends MysqlError {
  constructor(operation: string) {
    super({
      code: MysqlErrorCode.ReadOnlyTransaction,
      mysqlErrorCode: 1792,
      message: `Cannot execute ${operation} in read-only transaction`,
      retryable: false,
      details: { operation },
    });
    this.name = 'ReadOnlyTransactionError';
  }
}

/**
 * Generic transaction rollback.
 */
export class TransactionRollbackError extends MysqlError {
  constructor(message: string, mysqlErrorCode?: number) {
    super({
      code: MysqlErrorCode.TransactionRollback,
      message: `Transaction rollback: ${message}`,
      mysqlErrorCode,
      retryable: false,
    });
    this.name = 'TransactionRollbackError';
  }
}

/**
 * Transaction serialization failure.
 */
export class SerializationFailureError extends MysqlError {
  constructor() {
    super({
      code: MysqlErrorCode.SerializationFailure,
      message: 'Transaction serialization failure, should be retried',
      retryable: true,
      retryAfterMs: 100,
    });
    this.name = 'SerializationFailureError';
  }
}

// ============================================================================
// Type Errors (Non-Retryable)
// ============================================================================

/**
 * Unsupported MySQL type.
 */
export class UnsupportedTypeError extends MysqlError {
  constructor(mysqlType: string | number) {
    super({
      code: MysqlErrorCode.UnsupportedType,
      message: `Unsupported MySQL type: ${mysqlType}`,
      retryable: false,
      details: { mysqlType },
    });
    this.name = 'UnsupportedTypeError';
  }
}

/**
 * Type conversion error.
 */
export class ConversionError extends MysqlError {
  constructor(fromType: string, toType: string, value?: unknown) {
    super({
      code: MysqlErrorCode.ConversionError,
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
export class NullValueError extends MysqlError {
  constructor(column: string) {
    super({
      code: MysqlErrorCode.NullValue,
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
export class InvalidJsonError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.InvalidJson,
      mysqlErrorCode: 3140,
      message: `Invalid JSON: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidJsonError';
  }
}

/**
 * Truncated wrong value.
 */
export class TruncatedWrongValueError extends MysqlError {
  constructor(type: string, value: string) {
    super({
      code: MysqlErrorCode.TruncatedWrongValue,
      mysqlErrorCode: 1292,
      message: `Truncated incorrect ${type} value: '${value}'`,
      retryable: false,
      details: { type, value },
    });
    this.name = 'TruncatedWrongValueError';
  }
}

// ============================================================================
// Prepared Statement Errors (Non-Retryable)
// ============================================================================

/**
 * Prepared statement not found.
 */
export class PreparedStatementNotFoundError extends MysqlError {
  constructor(statementId: string | number) {
    super({
      code: MysqlErrorCode.PreparedStatementNotFound,
      mysqlErrorCode: 1243,
      message: `Unknown prepared statement handler (${statementId})`,
      retryable: false,
      details: { statementId },
    });
    this.name = 'PreparedStatementNotFoundError';
  }
}

/**
 * Prepared statement error.
 */
export class PreparedStatementError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.PreparedStatementError,
      message: `Prepared statement error: ${message}`,
      retryable: false,
    });
    this.name = 'PreparedStatementError';
  }
}

// ============================================================================
// Protocol Errors (Non-Retryable)
// ============================================================================

/**
 * Unexpected message from MySQL server.
 */
export class UnexpectedMessageError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.UnexpectedMessage,
      message: `Unexpected message from server: ${message}`,
      retryable: false,
    });
    this.name = 'UnexpectedMessageError';
  }
}

/**
 * Invalid response from MySQL server.
 */
export class InvalidResponseError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.InvalidResponse,
      message: `Invalid response from server: ${message}`,
      retryable: false,
    });
    this.name = 'InvalidResponseError';
  }
}

/**
 * Protocol version mismatch.
 */
export class ProtocolMismatchError extends MysqlError {
  constructor(message: string) {
    super({
      code: MysqlErrorCode.ProtocolMismatch,
      message: `Protocol mismatch: ${message}`,
      retryable: false,
    });
    this.name = 'ProtocolMismatchError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * Simulation mismatch - query doesn't match recording.
 */
export class SimulationMismatchError extends MysqlError {
  constructor(query: string, expectedQuery?: string) {
    super({
      code: MysqlErrorCode.SimulationMismatch,
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
export class SimulatedError extends MysqlError {
  constructor(errorType: string, message: string) {
    super({
      code: MysqlErrorCode.SimulatedError,
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
export class RecordingNotFoundError extends MysqlError {
  constructor(recordingPath: string) {
    super({
      code: MysqlErrorCode.RecordingNotFound,
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
export class CircuitBreakerOpenError extends MysqlError {
  constructor(resetTimeMs: number) {
    super({
      code: MysqlErrorCode.CircuitBreakerOpen,
      message: 'Circuit breaker is open, rejecting requests',
      retryable: false,
      retryAfterMs: resetTimeMs,
      details: { resetTimeMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Maps MySQL error codes to appropriate error classes.
 * See: https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
 */
export function parseMysqlError(
  mysqlError: MysqlErrorResponse | Error
): MysqlError {
  // Handle non-mysql errors
  if (!(mysqlError && typeof mysqlError === 'object')) {
    if (mysqlError instanceof Error) {
      return new ExecutionError(mysqlError.message, undefined, undefined, mysqlError);
    }
    return new ExecutionError(String(mysqlError));
  }

  // Check if it's already a MysqlError
  if (mysqlError instanceof MysqlError) {
    return mysqlError;
  }

  const error = mysqlError as MysqlErrorResponse;
  const errno = error.errno;
  const message = error.message ?? error.sqlMessage ?? 'Unknown error';
  const sqlState = error.sqlState;
  const sql = error.sql;

  // Map errno to error types
  switch (errno) {
    // Connection errors
    case 2003: // CR_CONNECTION_ERROR
      return new ConnectionRefusedError('unknown', 3306, mysqlError as Error);

    case 1040: // ER_CON_COUNT_ERROR
      return new TooManyConnectionsError();

    case 2013: // CR_SERVER_LOST
      return new ConnectionLostError(mysqlError as Error);

    case 2006: // CR_SERVER_GONE_ERROR
      return new ServerGoneError(mysqlError as Error);

    // Authentication errors
    case 1045: // ER_ACCESS_DENIED_ERROR
      return new AuthenticationFailedError(undefined, undefined, mysqlError as Error);

    case 1142: // ER_TABLEACCESS_DENIED_ERROR
      return new AccessDeniedError('operation', undefined);

    // Database/Schema errors
    case 1049: // ER_BAD_DB_ERROR
      return new DatabaseNotFoundError('unknown');

    case 1146: // ER_NO_SUCH_TABLE
      return new TableNotFoundError('unknown');

    case 1054: // ER_BAD_FIELD_ERROR
      return new ColumnNotFoundError('unknown');

    // Query errors
    case 1064: // ER_PARSE_ERROR
      return new SyntaxError(message, sql);

    case 1317: // ER_QUERY_INTERRUPTED
      return new QueryInterruptedError(message);

    // Constraint violations
    case 1062: // ER_DUP_ENTRY
      return new DuplicateKeyError('unknown', undefined, message);

    case 1451: // ER_ROW_IS_REFERENCED_2
    case 1452: // ER_NO_REFERENCED_ROW_2
      return new ForeignKeyViolationError('unknown', undefined, message);

    case 1406: // ER_DATA_TOO_LONG
      return new DataTooLongError('unknown');

    case 1048: // ER_BAD_NULL_ERROR
      return new NotNullViolationError('unknown');

    case 1264: // ER_WARN_DATA_OUT_OF_RANGE
      return new OutOfRangeError('unknown');

    // Transaction errors
    case 1213: // ER_LOCK_DEADLOCK
      return new DeadlockDetectedError();

    case 1205: // ER_LOCK_WAIT_TIMEOUT
      return new LockWaitTimeoutError();

    case 1180: // ER_ERROR_DURING_ROLLBACK
      return new TransactionAbortedError(message);

    case 1792: // ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION
      return new ReadOnlyTransactionError('unknown');

    // Type errors
    case 3140: // ER_INVALID_JSON_TEXT
      return new InvalidJsonError(message);

    case 1292: // ER_TRUNCATED_WRONG_VALUE
      return new TruncatedWrongValueError('unknown', message);

    // Prepared statement errors
    case 1243: // ER_UNKNOWN_STMT_HANDLER
      return new PreparedStatementNotFoundError('unknown');

    // Character set errors
    case 1115: // ER_UNKNOWN_CHARACTER_SET
      return new ConfigurationError(`Unknown character set: ${message}`);

    case 1267: // ER_COLLATION_CHARSET_MISMATCH
      return new ConfigurationError(`Collation charset mismatch: ${message}`);

    // Storage errors
    case 1114: // ER_RECORD_FILE_FULL
      return new ExecutionError('Table is full', errno, sqlState);

    default:
      // Check for common error patterns in message
      if (errno) {
        const errorMsg = message.toLowerCase();

        // Connection-related errors
        if (errorMsg.includes('connection') || errorMsg.includes('connect')) {
          if (errorMsg.includes('refused') || errorMsg.includes('cannot connect')) {
            return new ConnectionRefusedError('unknown', 3306, mysqlError as Error);
          }
          if (errorMsg.includes('lost') || errorMsg.includes('gone away')) {
            return new ServerGoneError(mysqlError as Error);
          }
        }

        // Authentication errors
        if (errorMsg.includes('access denied') || errorMsg.includes('authentication')) {
          return new AuthenticationFailedError(undefined, undefined, mysqlError as Error);
        }

        // Transaction errors
        if (errorMsg.includes('deadlock')) {
          return new DeadlockDetectedError();
        }
        if (errorMsg.includes('lock wait timeout')) {
          return new LockWaitTimeoutError();
        }
      }

      // Generic execution error
      return new ExecutionError(message, errno, sqlState);
  }
}

/**
 * Checks if an error is a MySQL error.
 */
export function isMysqlError(error: unknown): error is MysqlError {
  return error instanceof MysqlError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isMysqlError(error)) {
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
      message.includes('epipe') ||
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
  if (isMysqlError(error)) {
    return error.retryAfterMs;
  }
  return undefined;
}

/**
 * Extracts table name from error details.
 */
export function getTableName(error: MysqlError): string | undefined {
  return error.details?.table as string | undefined;
}

/**
 * Extracts column name from error details.
 */
export function getColumnName(error: MysqlError): string | undefined {
  return error.details?.column as string | undefined;
}

/**
 * Extracts constraint name from error details.
 */
export function getConstraintName(error: MysqlError): string | undefined {
  return error.details?.constraint as string | undefined;
}

/**
 * Checks if error is a duplicate key violation.
 */
export function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return error instanceof DuplicateKeyError;
}

/**
 * Checks if error is a foreign key violation.
 */
export function isForeignKeyViolationError(error: unknown): error is ForeignKeyViolationError {
  return error instanceof ForeignKeyViolationError;
}

/**
 * Checks if error is a deadlock.
 */
export function isDeadlockError(error: unknown): error is DeadlockDetectedError {
  return error instanceof DeadlockDetectedError;
}

/**
 * Checks if error is a connection error.
 */
export function isConnectionError(error: unknown): boolean {
  return (
    error instanceof ConnectionRefusedError ||
    error instanceof ConnectionLostError ||
    error instanceof ServerGoneError ||
    error instanceof TooManyConnectionsError ||
    error instanceof AcquireTimeoutError ||
    error instanceof PoolExhaustedError
  );
}

/**
 * Checks if error is an authentication error.
 */
export function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof AuthenticationFailedError ||
    error instanceof AccessDeniedError
  );
}

/**
 * Checks if error is a transaction error.
 */
export function isTransactionError(error: unknown): boolean {
  return (
    error instanceof DeadlockDetectedError ||
    error instanceof LockWaitTimeoutError ||
    error instanceof TransactionAbortedError ||
    error instanceof ReadOnlyTransactionError ||
    error instanceof TransactionRollbackError ||
    error instanceof SerializationFailureError
  );
}
