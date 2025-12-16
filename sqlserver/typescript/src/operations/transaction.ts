/**
 * Transaction management for SQL Server following SPARC specification.
 *
 * Provides transaction lifecycle management, savepoints, and error handling
 * with proper connection management and observability integration.
 *
 * @module operations/transaction
 */

import * as mssql from 'mssql';
import { PooledConnection, ConnectionPool } from '../pool/index.js';
import {
  IsolationLevel,
  Savepoint,
  generateTransactionId,
  QueryParam,
} from '../types/index.js';
import {
  SqlServerError,
  SqlServerErrorCode,
  TransactionAbortedError,
  InvalidSavepointError,
  ExecutionError,
  DeadlockDetectedError,
  LockTimeoutError,
  parseSqlServerError,
} from '../errors/index.js';
import { Observability, MetricNames } from '../observability/index.js';

// ============================================================================
// Transaction Options
// ============================================================================

/**
 * Options for configuring a transaction.
 */
export interface TransactionOptions {
  /**
   * Transaction isolation level.
   * @default IsolationLevel.ReadCommitted
   */
  isolation?: IsolationLevel;

  /**
   * Whether the transaction is read-only.
   * Read-only transactions can enable optimizations and prevent writes.
   * @default false
   */
  readOnly?: boolean;

  /**
   * Transaction name for identification in logs and traces.
   */
  name?: string;
}

// ============================================================================
// Savepoint Class
// ============================================================================

/**
 * Represents a savepoint within a transaction.
 *
 * Savepoints allow partial rollback of a transaction without aborting
 * the entire transaction.
 */
export class SavepointImpl implements Savepoint {
  /** Savepoint name (must be a valid SQL Server identifier). */
  public readonly name: string;

  /** When the savepoint was created. */
  public readonly createdAt: Date;

  /** Whether the savepoint has been released. */
  public released: boolean = false;

  constructor(name: string) {
    this.name = name;
    this.createdAt = new Date();
  }

  /**
   * Validates a savepoint name.
   *
   * @param name - Savepoint name to validate
   * @throws {SqlServerError} If the name is invalid
   */
  static validateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new InvalidSavepointError(name, 'Savepoint name cannot be empty');
    }

    // SQL Server identifier validation
    if (!/^[a-zA-Z_@#][a-zA-Z0-9_@#$]*$/.test(name)) {
      throw new InvalidSavepointError(
        name,
        'Must start with letter/underscore/@/# and contain only valid identifier characters'
      );
    }

    if (name.length > 32) {
      throw new InvalidSavepointError(
        name,
        'Savepoint name exceeds SQL Server maximum of 32 characters'
      );
    }
  }
}

// ============================================================================
// Isolation Level Mapping
// ============================================================================

/**
 * Maps IsolationLevel enum to mssql isolation level constants.
 */
function toMssqlIsolationLevel(level: IsolationLevel): mssql.IIsolationLevel {
  switch (level) {
    case IsolationLevel.ReadUncommitted:
      return mssql.ISOLATION_LEVEL.READ_UNCOMMITTED;
    case IsolationLevel.ReadCommitted:
      return mssql.ISOLATION_LEVEL.READ_COMMITTED;
    case IsolationLevel.RepeatableRead:
      return mssql.ISOLATION_LEVEL.REPEATABLE_READ;
    case IsolationLevel.Serializable:
      return mssql.ISOLATION_LEVEL.SERIALIZABLE;
    case IsolationLevel.Snapshot:
      return mssql.ISOLATION_LEVEL.SNAPSHOT;
    default:
      return mssql.ISOLATION_LEVEL.READ_COMMITTED;
  }
}

// ============================================================================
// Transaction Class
// ============================================================================

/**
 * Represents an active database transaction.
 *
 * Transactions provide ACID guarantees and allow multiple operations
 * to be executed atomically. The transaction holds a dedicated connection
 * from the pool for its entire lifetime.
 */
export class Transaction {
  /** Unique transaction identifier. */
  public readonly id: string;

  /** Transaction isolation level. */
  public readonly isolation: IsolationLevel;

  /** Whether the transaction is read-only. */
  public readonly readOnly: boolean;

  /** When the transaction started. */
  public readonly startedAt: Date;

  /** Dedicated connection held for the transaction duration. */
  public readonly connection: PooledConnection;

  /** Active savepoints in this transaction. */
  private readonly savepoints: SavepointImpl[] = [];

  /** Whether the transaction has been committed. */
  private committed: boolean = false;

  /** Whether the transaction has been rolled back. */
  private rolledBack: boolean = false;

  /** Whether the transaction has failed and should be aborted. */
  private aborted: boolean = false;

  /** Underlying mssql transaction. */
  private readonly mssqlTransaction: mssql.Transaction;

  /** Observability instance for logging and metrics. */
  private readonly observability: Observability;

  constructor(
    connection: PooledConnection,
    mssqlTransaction: mssql.Transaction,
    options: Required<Omit<TransactionOptions, 'name'>> & { name?: string },
    observability: Observability
  ) {
    this.id = generateTransactionId();
    this.connection = connection;
    this.mssqlTransaction = mssqlTransaction;
    this.isolation = options.isolation;
    this.readOnly = options.readOnly;
    this.startedAt = new Date();
    this.observability = observability;
  }

  /**
   * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE).
   *
   * @param query - SQL query string
   * @param params - Query parameters as key-value pairs
   * @returns Number of rows affected
   * @throws {SqlServerError} If the transaction is aborted or query fails
   */
  async execute(query: string, params?: Record<string, unknown>): Promise<number> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const request = new mssql.Request(this.mssqlTransaction);

      // Add parameters
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      this.observability.metrics.timing(
        MetricNames.QUERY_DURATION_SECONDS,
        duration,
        { operation: 'execute', transaction: 'true' }
      );

      this.observability.logger.debug('Transaction query executed', {
        transactionId: this.id,
        rowCount: result.rowsAffected.reduce((a, b) => a + b, 0),
        durationMs: duration,
      });

      return result.rowsAffected.reduce((a, b) => a + b, 0);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute a query and return a single row.
   *
   * @param query - SQL query string
   * @param params - Query parameters as key-value pairs
   * @returns Single row or null if no rows found
   * @throws {SqlServerError} If multiple rows are returned or query fails
   */
  async executeOne<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T | null> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const request = new mssql.Request(this.mssqlTransaction);

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      this.observability.metrics.timing(
        MetricNames.QUERY_DURATION_SECONDS,
        duration,
        { operation: 'executeOne', transaction: 'true' }
      );

      const recordset = result.recordset || [];
      if (recordset.length === 0) {
        return null;
      }

      if (recordset.length > 1) {
        throw new ExecutionError(`Expected single row, got ${recordset.length} rows`);
      }

      return recordset[0] as T;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute a query and return all rows.
   *
   * @param query - SQL query string
   * @param params - Query parameters as key-value pairs
   * @returns Array of rows
   * @throws {SqlServerError} If query fails
   */
  async executeMany<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const request = new mssql.Request(this.mssqlTransaction);

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      this.observability.metrics.timing(
        MetricNames.QUERY_DURATION_SECONDS,
        duration,
        { operation: 'executeMany', transaction: 'true' }
      );

      this.observability.metrics.increment(
        MetricNames.ROWS_RETURNED_TOTAL,
        result.recordset?.length || 0,
        { transaction: 'true' }
      );

      return (result.recordset || []) as T[];
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Create a savepoint within the transaction.
   *
   * Savepoints allow partial rollback without aborting the entire transaction.
   *
   * @param name - Savepoint name (must be valid SQL Server identifier)
   * @returns The created savepoint
   * @throws {SqlServerError} If savepoint creation fails
   */
  async savepoint(name: string): Promise<Savepoint> {
    this.checkNotFinalized();
    SavepointImpl.validateName(name);

    // Check for duplicate savepoint name
    if (this.savepoints.some((sp) => sp.name === name)) {
      throw new InvalidSavepointError(name, 'Savepoint already exists');
    }

    try {
      const request = new mssql.Request(this.mssqlTransaction);
      await request.query(`SAVE TRANSACTION ${name}`);

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      const savepoint = new SavepointImpl(name);
      this.savepoints.push(savepoint);

      this.observability.logger.debug('Savepoint created', {
        transactionId: this.id,
        savepointName: name,
      });

      return savepoint;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Rollback to a savepoint, undoing changes made after it.
   *
   * @param savepoint - Savepoint to rollback to
   * @throws {SqlServerError} If savepoint is invalid or rollback fails
   */
  async rollbackToSavepoint(savepoint: Savepoint): Promise<void> {
    this.checkNotFinalized();

    const spIndex = this.savepoints.findIndex((s) => s.name === savepoint.name);
    if (spIndex === -1) {
      throw new InvalidSavepointError(savepoint.name, 'Savepoint not found in transaction');
    }

    const sp = this.savepoints[spIndex];
    if (sp?.released) {
      throw new InvalidSavepointError(savepoint.name, 'Cannot rollback to released savepoint');
    }

    try {
      const request = new mssql.Request(this.mssqlTransaction);
      await request.query(`ROLLBACK TRANSACTION ${savepoint.name}`);

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      // Remove all savepoints created after this one
      this.savepoints.splice(spIndex + 1);

      this.observability.logger.debug('Rolled back to savepoint', {
        transactionId: this.id,
        savepointName: savepoint.name,
      });
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Commit the transaction, persisting all changes.
   *
   * @throws {SqlServerError} If commit fails
   */
  async commit(): Promise<void> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      await this.mssqlTransaction.commit();
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.inTransaction = false;
      this.committed = true;

      const transactionDuration = Date.now() - this.startedAt.getTime();
      this.observability.metrics.timing(
        MetricNames.TRANSACTION_DURATION_SECONDS,
        transactionDuration,
        { outcome: 'committed' }
      );

      this.observability.metrics.increment(
        MetricNames.TRANSACTIONS_TOTAL,
        1,
        { outcome: 'committed' }
      );

      this.observability.logger.info('Transaction committed', {
        transactionId: this.id,
        durationMs: transactionDuration,
        commitDurationMs: duration,
      });
    } catch (error) {
      this.aborted = true;
      this.connection.inTransaction = false;

      this.observability.logger.error('Transaction commit failed', {
        transactionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw this.wrapError(error);
    }
  }

  /**
   * Rollback the transaction, discarding all changes.
   *
   * @throws {SqlServerError} If rollback fails
   */
  async rollback(): Promise<void> {
    // Allow rollback even if already finalized (idempotent)
    if (this.committed) {
      throw new TransactionAbortedError('Cannot rollback a committed transaction');
    }

    if (this.rolledBack) {
      // Idempotent: already rolled back
      return;
    }

    try {
      await this.mssqlTransaction.rollback();

      this.connection.queryCount++;
      this.connection.inTransaction = false;
      this.rolledBack = true;

      const transactionDuration = Date.now() - this.startedAt.getTime();
      this.observability.metrics.timing(
        MetricNames.TRANSACTION_DURATION_SECONDS,
        transactionDuration,
        { outcome: 'rolled_back' }
      );

      this.observability.metrics.increment(
        MetricNames.TRANSACTIONS_TOTAL,
        1,
        { outcome: 'rolled_back' }
      );

      this.observability.logger.info('Transaction rolled back', {
        transactionId: this.id,
        durationMs: transactionDuration,
      });
    } catch (error) {
      this.aborted = true;
      this.connection.inTransaction = false;

      this.observability.logger.error('Transaction rollback failed', {
        transactionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw this.wrapError(error);
    }
  }

  /**
   * Checks if the transaction has been finalized (committed or rolled back).
   *
   * @throws {SqlServerError} If transaction is finalized or aborted
   */
  private checkNotFinalized(): void {
    if (this.aborted) {
      throw new TransactionAbortedError(
        `Transaction ${this.id} has been aborted due to previous error`
      );
    }

    if (this.committed) {
      throw new TransactionAbortedError(
        `Transaction ${this.id} has already been committed`
      );
    }

    if (this.rolledBack) {
      throw new TransactionAbortedError(
        `Transaction ${this.id} has already been rolled back`
      );
    }
  }

  /**
   * Handles query errors within the transaction.
   */
  private handleError(error: unknown): void {
    const sqlError = this.wrapError(error);

    // Mark transaction as aborted on certain errors
    if (
      sqlError.code === SqlServerErrorCode.DeadlockDetected ||
      sqlError.code === SqlServerErrorCode.LockTimeout ||
      sqlError.code === SqlServerErrorCode.TransactionAborted
    ) {
      this.aborted = true;
    }

    this.observability.logger.error('Transaction error', {
      transactionId: this.id,
      errorCode: sqlError.code,
      errorNumber: sqlError.errorNumber,
      message: sqlError.message,
    });

    this.observability.metrics.increment(
      MetricNames.ERRORS_TOTAL,
      1,
      { code: sqlError.code, transaction: 'true' }
    );
  }

  /**
   * Wraps an error in a SqlServerError if it isn't already.
   */
  private wrapError(error: unknown): SqlServerError {
    if (error instanceof SqlServerError) {
      return error;
    }

    if (error instanceof Error) {
      const sqlErr = error as Error & { number?: number };
      if (sqlErr.number) {
        return parseSqlServerError(sqlErr as any);
      }

      return new ExecutionError(error.message, undefined, error);
    }

    return new ExecutionError(String(error));
  }
}

// ============================================================================
// Transaction Manager
// ============================================================================

/**
 * Manages transaction lifecycle and provides transaction helpers.
 */
export class TransactionManager {
  private readonly pool: ConnectionPool;
  private readonly observability: Observability;

  constructor(pool: ConnectionPool, observability: Observability) {
    this.pool = pool;
    this.observability = observability;
  }

  /**
   * Begin a new transaction with the specified options.
   *
   * @param options - Transaction options
   * @returns A new Transaction instance
   * @throws {SqlServerError} If connection acquisition or BEGIN fails
   */
  async begin(options?: TransactionOptions): Promise<Transaction> {
    const opts = this.normalizeOptions(options);

    try {
      // Acquire connection (always from primary for transactions)
      const connection = await this.pool.acquire('primary');

      this.observability.logger.debug('Beginning transaction', {
        isolation: opts.isolation,
        readOnly: opts.readOnly,
        name: opts.name,
      });

      // Create mssql transaction
      const mssqlTransaction = new mssql.Transaction(connection.pool);

      // Begin transaction with isolation level
      await mssqlTransaction.begin(toMssqlIsolationLevel(opts.isolation));

      connection.inTransaction = true;
      connection.queryCount++;
      connection.lastUsedAt = new Date();

      // Create transaction object
      const transaction = new Transaction(connection, mssqlTransaction, opts, this.observability);

      this.observability.logger.info('Transaction started', {
        transactionId: transaction.id,
        isolation: opts.isolation,
      });

      return transaction;
    } catch (error) {
      this.observability.logger.error('Failed to begin transaction', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error instanceof SqlServerError
        ? error
        : new TransactionAbortedError('Failed to begin transaction');
    }
  }

  /**
   * Execute a function within a transaction, with automatic commit/rollback.
   *
   * If the function completes successfully, the transaction is committed.
   * If the function throws an error, the transaction is rolled back.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns The result of the function
   * @throws {SqlServerError} If transaction fails or function throws
   */
  async withTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const tx = await this.begin(options);

    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      try {
        await tx.rollback();
      } catch (rollbackError) {
        // Log rollback error but throw original error
        this.observability.logger.error('Failed to rollback transaction', {
          transactionId: tx.id,
          error:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        });
      }
      throw error;
    }
  }

  /**
   * Normalizes transaction options with defaults.
   */
  private normalizeOptions(
    options?: TransactionOptions
  ): Required<Omit<TransactionOptions, 'name'>> & { name?: string } {
    return {
      isolation: options?.isolation ?? IsolationLevel.ReadCommitted,
      readOnly: options?.readOnly ?? false,
      name: options?.name,
    };
  }
}
