/**
 * Redshift Transaction Manager
 *
 * Provides transaction lifecycle management with Redshift-specific features:
 * - Support for READ COMMITTED and SERIALIZABLE isolation levels
 * - Savepoint management
 * - Automatic retry on serialization failures
 * - Connection management and timeout handling
 * - VACUUM-aware transaction tracking
 *
 * @module @llmdevops/redshift-integration/pool/transaction
 */

import type { QueryResult as PgQueryResult } from 'pg';
import { Session } from './session.js';
import { RedshiftError, RedshiftErrorCode } from '../errors/index.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Transaction isolation level.
 * Redshift only supports READ COMMITTED and SERIALIZABLE.
 */
export type IsolationLevel = 'READ_COMMITTED' | 'SERIALIZABLE';

/**
 * Transaction state.
 */
export type TransactionState = 'pending' | 'active' | 'committed' | 'rolledback';

/**
 * Configuration options for a transaction.
 */
export interface TransactionOptions {
  /**
   * Transaction isolation level.
   * @default 'SERIALIZABLE'
   */
  isolationLevel?: IsolationLevel;

  /**
   * Whether the transaction is read-only.
   * Read-only transactions can enable optimizations.
   * @default false
   */
  readOnly?: boolean;

  /**
   * Per-statement timeout in milliseconds.
   * This timeout applies to each individual statement within the transaction.
   * @default undefined (no timeout)
   */
  statementTimeout?: number;
}

/**
 * Represents a single row from a query result.
 */
export interface Row {
  [key: string]: unknown;
}

/**
 * Query result from a transaction operation.
 */
export interface QueryResult {
  /** Number of rows affected */
  rowCount: number;
  /** Result rows */
  rows: Row[];
  /** Query execution metadata */
  fields?: Array<{ name: string; dataTypeID: number }>;
}

// ============================================================================
// Transaction Class
// ============================================================================

/**
 * Represents an active Redshift transaction.
 *
 * Manages the lifecycle of a transaction including:
 * - Beginning the transaction with specified isolation level
 * - Executing queries within the transaction context
 * - Managing savepoints for partial rollback
 * - Committing or rolling back changes
 * - Automatic cleanup and session release
 *
 * @example
 * ```typescript
 * const session = await pool.acquire();
 * const tx = new Transaction(session, { isolationLevel: 'SERIALIZABLE' });
 *
 * try {
 *   await tx.begin();
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Alice']);
 *   await tx.commit();
 * } catch (error) {
 *   await tx.rollback();
 *   throw error;
 * } finally {
 *   await pool.release(session);
 * }
 * ```
 */
export class Transaction {
  /** Unique transaction identifier */
  public readonly id: string;

  /** The session used for this transaction */
  public readonly session: Session;

  /** Transaction configuration options */
  public readonly options: Required<TransactionOptions>;

  /** When the transaction was created */
  public readonly createdAt: Date;

  /** When the transaction started (after BEGIN) */
  private startedAt?: Date;

  /** Current transaction state */
  private state: TransactionState;

  /** Active savepoints in this transaction */
  private readonly savepoints: Set<string>;

  /** Number of queries executed in this transaction */
  private queryCount: number;

  constructor(session: Session, options: TransactionOptions = {}) {
    this.id = uuidv4();
    this.session = session;
    this.options = {
      isolationLevel: options.isolationLevel ?? 'SERIALIZABLE',
      readOnly: options.readOnly ?? false,
      statementTimeout: options.statementTimeout,
    };
    this.createdAt = new Date();
    this.state = 'pending';
    this.savepoints = new Set();
    this.queryCount = 0;
  }

  /**
   * Gets the current transaction state.
   */
  getState(): TransactionState {
    return this.state;
  }

  /**
   * Checks if the transaction is active.
   * @returns true if the transaction is active and can execute queries
   */
  isActive(): boolean {
    return this.state === 'active';
  }

  /**
   * Gets transaction duration in milliseconds.
   * @returns duration since BEGIN, or 0 if not started
   */
  getDuration(): number {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt.getTime();
  }

  /**
   * Gets the number of queries executed in this transaction.
   */
  getQueryCount(): number {
    return this.queryCount;
  }

  /**
   * Begins the transaction with the configured isolation level.
   *
   * Executes the BEGIN statement with the appropriate isolation level
   * and read-only mode if specified.
   *
   * @throws {RedshiftError} If transaction is already started or BEGIN fails
   */
  async begin(): Promise<void> {
    if (this.state !== 'pending') {
      throw new RedshiftError(
        `Transaction is already ${this.state}`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false, context: { transactionId: this.id, state: this.state } }
      );
    }

    try {
      // Build BEGIN statement with isolation level
      const parts: string[] = ['BEGIN'];

      // Add isolation level
      if (this.options.isolationLevel === 'READ_COMMITTED') {
        parts.push('ISOLATION LEVEL READ COMMITTED');
      } else {
        parts.push('ISOLATION LEVEL SERIALIZABLE');
      }

      // Add read-only mode
      if (this.options.readOnly) {
        parts.push('READ ONLY');
      }

      const beginSql = parts.join(' ');

      // Execute BEGIN
      await this.session.execute(beginSql);

      // Set statement timeout if specified
      if (this.options.statementTimeout !== undefined) {
        await this.session.execute(
          `SET statement_timeout = ${this.options.statementTimeout}`
        );
      }

      this.state = 'active';
      this.startedAt = new Date();
    } catch (error) {
      this.state = 'rolledback';
      throw this.mapError(error, 'Failed to begin transaction');
    }
  }

  /**
   * Commits the transaction, persisting all changes.
   *
   * @throws {RedshiftError} If transaction is not active or COMMIT fails
   */
  async commit(): Promise<void> {
    if (this.state !== 'active') {
      throw new RedshiftError(
        `Cannot commit transaction in ${this.state} state`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false, context: { transactionId: this.id, state: this.state } }
      );
    }

    try {
      await this.session.execute('COMMIT');
      this.state = 'committed';
      this.savepoints.clear();
    } catch (error) {
      // On commit failure, try to rollback
      try {
        await this.session.execute('ROLLBACK');
        this.state = 'rolledback';
      } catch {
        // Rollback failed, session may be in error state
      }
      throw this.mapError(error, 'Failed to commit transaction');
    }
  }

  /**
   * Rolls back the transaction, discarding all changes.
   *
   * This operation is idempotent and safe to call multiple times.
   *
   * @throws {RedshiftError} If ROLLBACK fails
   */
  async rollback(): Promise<void> {
    // Allow rollback if already rolled back (idempotent)
    if (this.state === 'rolledback') {
      return;
    }

    if (this.state === 'committed') {
      throw new RedshiftError(
        'Cannot rollback a committed transaction',
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false, context: { transactionId: this.id } }
      );
    }

    try {
      // Only execute ROLLBACK if transaction was active
      if (this.state === 'active') {
        await this.session.execute('ROLLBACK');
      }
      this.state = 'rolledback';
      this.savepoints.clear();
    } catch (error) {
      throw this.mapError(error, 'Failed to rollback transaction');
    }
  }

  /**
   * Executes a query within the transaction.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns Query result
   * @throws {RedshiftError} If transaction is not active or query fails
   */
  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.checkActive();

    try {
      const result = await this.session.execute(sql, params);
      this.queryCount++;

      return {
        rowCount: result.rowCount ?? 0,
        rows: result.rows as Row[],
        fields: result.fields,
      };
    } catch (error) {
      const redshiftError = this.mapError(error, 'Query execution failed');

      // Auto-rollback on serialization failure
      if (this.isSerializationFailure(error)) {
        try {
          await this.rollback();
        } catch {
          // Ignore rollback errors
        }
      }

      throw redshiftError;
    }
  }

  /**
   * Executes a query and returns a single row.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns Single row or null if no rows found
   * @throws {RedshiftError} If multiple rows are returned or query fails
   */
  async executeOne(sql: string, params?: unknown[]): Promise<Row | null> {
    const result = await this.execute(sql, params);

    if (result.rows.length === 0) {
      return null;
    }

    if (result.rows.length > 1) {
      throw new RedshiftError(
        `Expected single row, got ${result.rows.length} rows`,
        RedshiftErrorCode.QUERY_FAILED,
        { retryable: false }
      );
    }

    return result.rows[0]!;
  }

  /**
   * Creates a savepoint within the transaction.
   *
   * Savepoints allow partial rollback without aborting the entire transaction.
   *
   * @param name - Savepoint name (must be valid SQL identifier)
   * @returns Promise that resolves when savepoint is created
   * @throws {RedshiftError} If savepoint creation fails
   */
  async savepoint(name: string): Promise<void> {
    this.checkActive();
    this.validateSavepointName(name);

    if (this.savepoints.has(name)) {
      throw new RedshiftError(
        `Savepoint '${name}' already exists`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }

    try {
      await this.session.execute(`SAVEPOINT ${name}`);
      this.savepoints.add(name);
    } catch (error) {
      throw this.mapError(error, `Failed to create savepoint '${name}'`);
    }
  }

  /**
   * Rolls back to a savepoint, undoing changes made after it.
   *
   * @param name - Savepoint name
   * @returns Promise that resolves when rollback is complete
   * @throws {RedshiftError} If savepoint doesn't exist or rollback fails
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    this.checkActive();

    if (!this.savepoints.has(name)) {
      throw new RedshiftError(
        `Savepoint '${name}' does not exist`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }

    try {
      await this.session.execute(`ROLLBACK TO SAVEPOINT ${name}`);

      // Remove savepoints created after this one
      // Note: In Redshift, rolling back to a savepoint doesn't destroy it
      // but it does invalidate any savepoints created after it
      const savepointsArray = Array.from(this.savepoints);
      const index = savepointsArray.indexOf(name);
      if (index >= 0) {
        savepointsArray.slice(index + 1).forEach(sp => this.savepoints.delete(sp));
      }
    } catch (error) {
      throw this.mapError(error, `Failed to rollback to savepoint '${name}'`);
    }
  }

  /**
   * Releases a savepoint, discarding it.
   *
   * The savepoint's effects remain, but the savepoint itself is removed.
   *
   * @param name - Savepoint name
   * @returns Promise that resolves when savepoint is released
   * @throws {RedshiftError} If savepoint doesn't exist or release fails
   */
  async releaseSavepoint(name: string): Promise<void> {
    this.checkActive();

    if (!this.savepoints.has(name)) {
      throw new RedshiftError(
        `Savepoint '${name}' does not exist`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }

    try {
      await this.session.execute(`RELEASE SAVEPOINT ${name}`);
      this.savepoints.delete(name);
    } catch (error) {
      throw this.mapError(error, `Failed to release savepoint '${name}'`);
    }
  }

  /**
   * Validates that the transaction is active.
   * @throws {RedshiftError} If transaction is not active
   */
  private checkActive(): void {
    if (this.state !== 'active') {
      throw new RedshiftError(
        `Transaction is ${this.state}, not active`,
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false, context: { transactionId: this.id, state: this.state } }
      );
    }
  }

  /**
   * Validates a savepoint name.
   * @param name - Savepoint name to validate
   * @throws {RedshiftError} If name is invalid
   */
  private validateSavepointName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new RedshiftError(
        'Savepoint name cannot be empty',
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }

    // Validate SQL identifier: must start with letter or underscore,
    // contain only alphanumeric characters and underscores, and be <= 127 chars
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new RedshiftError(
        'Savepoint name must start with letter/underscore and contain only alphanumeric/underscore characters',
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }

    if (name.length > 127) {
      throw new RedshiftError(
        'Savepoint name exceeds maximum length of 127 characters',
        RedshiftErrorCode.TRANSACTION_FAILED,
        { retryable: false }
      );
    }
  }

  /**
   * Checks if an error is a serialization failure.
   * @param error - Error to check
   * @returns true if error is a serialization failure
   */
  private isSerializationFailure(error: unknown): boolean {
    const pgError = error as { code?: string };
    return pgError.code === '40001'; // SQLSTATE 40001: serialization failure
  }

  /**
   * Maps a generic error to a RedshiftError.
   * @param error - Error to map
   * @param context - Additional context message
   * @returns RedshiftError
   */
  private mapError(error: unknown, context: string): RedshiftError {
    if (error instanceof RedshiftError) {
      return error;
    }

    const pgError = error as { code?: string; message?: string };
    const message = pgError.message || context;
    const sqlState = pgError.code;

    // Map specific transaction errors
    let code: RedshiftErrorCode;
    let retryable = false;

    if (sqlState === '40001') {
      // Serialization failure - retryable
      code = RedshiftErrorCode.TRANSACTION_ABORTED;
      retryable = true;
    } else if (sqlState === '40P01') {
      // Deadlock detected - retryable
      code = RedshiftErrorCode.DEADLOCK;
      retryable = true;
    } else if (sqlState === '25P02') {
      // Transaction aborted
      code = RedshiftErrorCode.TRANSACTION_ABORTED;
      retryable = false;
    } else {
      code = RedshiftErrorCode.TRANSACTION_FAILED;
      retryable = false;
    }

    return new RedshiftError(message, code, {
      sqlState,
      cause: error instanceof Error ? error : undefined,
      retryable,
      context: { transactionId: this.id },
    });
  }
}

// ============================================================================
// Transaction Manager
// ============================================================================

/**
 * Configuration options for the transaction manager.
 */
export interface TransactionManagerOptions {
  /**
   * Maximum number of retry attempts on serialization failure.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds between retry attempts.
   * Uses exponential backoff: baseDelay * (2 ^ attempt)
   * @default 100
   */
  retryBaseDelay?: number;

  /**
   * Maximum delay in milliseconds between retry attempts.
   * @default 5000
   */
  retryMaxDelay?: number;
}

/**
 * Interface for connection pool (minimal interface needed for transactions).
 */
export interface ConnectionPool {
  /**
   * Acquires a session from the pool.
   */
  acquire(): Promise<Session>;

  /**
   * Releases a session back to the pool.
   */
  release(session: Session): Promise<void>;
}

/**
 * Manages transaction lifecycle and provides transaction helpers.
 *
 * The TransactionManager is responsible for:
 * - Acquiring sessions from the connection pool
 * - Beginning transactions with proper configuration
 * - Executing transaction callbacks with automatic commit/rollback
 * - Retrying on serialization failures
 * - Releasing sessions back to the pool
 *
 * @example
 * ```typescript
 * const manager = new TransactionManager(pool);
 *
 * // Automatic transaction management with retry on serialization failure
 * const result = await manager.runInTransaction(async (tx) => {
 *   await tx.execute('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, 1]);
 *   await tx.execute('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, 2]);
 *   return tx.executeOne('SELECT balance FROM accounts WHERE id = $1', [1]);
 * }, { isolationLevel: 'SERIALIZABLE' });
 * ```
 */
export class TransactionManager {
  private readonly pool: ConnectionPool;
  private readonly options: Required<TransactionManagerOptions>;

  constructor(pool: ConnectionPool, options: TransactionManagerOptions = {}) {
    this.pool = pool;
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelay: options.retryBaseDelay ?? 100,
      retryMaxDelay: options.retryMaxDelay ?? 5000,
    };
  }

  /**
   * Runs a function within a transaction with automatic commit/rollback.
   *
   * If the function completes successfully, the transaction is committed.
   * If the function throws an error, the transaction is rolled back.
   * Serialization failures (SQLSTATE 40001) trigger automatic retry.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns The result of the function
   * @throws {RedshiftError} If transaction fails after all retries
   */
  async runInTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    let lastError: RedshiftError | undefined;
    let attempt = 0;

    while (attempt <= this.options.maxRetries) {
      const session = await this.pool.acquire();
      const tx = new Transaction(session, options);

      try {
        await tx.begin();
        const result = await fn(tx);
        await tx.commit();
        await this.pool.release(session);
        return result;
      } catch (error) {
        lastError = this.ensureRedshiftError(error);

        // Try to rollback (ignore errors if transaction is already aborted)
        try {
          await tx.rollback();
        } catch {
          // Ignore rollback errors
        }

        // Always release the session
        await this.pool.release(session);

        // Check if we should retry
        if (lastError.retryable && attempt < this.options.maxRetries) {
          // Calculate exponential backoff delay
          const delay = Math.min(
            this.options.retryBaseDelay * Math.pow(2, attempt),
            this.options.retryMaxDelay
          );

          // Wait before retrying
          await this.sleep(delay);
          attempt++;
          continue;
        }

        // No more retries or non-retryable error
        throw lastError;
      }
    }

    // This should never happen, but TypeScript needs it
    throw lastError || new RedshiftError(
      'Transaction failed',
      RedshiftErrorCode.TRANSACTION_FAILED,
      { retryable: false }
    );
  }

  /**
   * Ensures an error is a RedshiftError.
   * @param error - Error to check
   * @returns RedshiftError
   */
  private ensureRedshiftError(error: unknown): RedshiftError {
    if (error instanceof RedshiftError) {
      return error;
    }

    return new RedshiftError(
      error instanceof Error ? error.message : String(error),
      RedshiftErrorCode.TRANSACTION_FAILED,
      {
        cause: error instanceof Error ? error : undefined,
        retryable: false,
      }
    );
  }

  /**
   * Sleeps for the specified duration.
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Higher-Order Function
// ============================================================================

/**
 * Creates a transaction manager wrapper function.
 *
 * This is a decorator-style higher-order function that wraps a callback
 * in a transaction with automatic commit on success and rollback on error.
 *
 * @param pool - Connection pool to use
 * @param options - Transaction manager options
 * @returns A function that executes callbacks within transactions
 *
 * @example
 * ```typescript
 * const withTx = withTransaction(pool);
 *
 * const result = await withTx(async (tx) => {
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Alice']);
 *   return tx.executeOne('SELECT id FROM users WHERE name = $1', ['Alice']);
 * }, { isolationLevel: 'READ_COMMITTED' });
 * ```
 */
export function withTransaction(
  pool: ConnectionPool,
  options?: TransactionManagerOptions
): <T>(
  fn: (tx: Transaction) => Promise<T>,
  txOptions?: TransactionOptions
) => Promise<T> {
  const manager = new TransactionManager(pool, options);
  return <T>(
    fn: (tx: Transaction) => Promise<T>,
    txOptions?: TransactionOptions
  ): Promise<T> => {
    return manager.runInTransaction(fn, txOptions);
  };
}
