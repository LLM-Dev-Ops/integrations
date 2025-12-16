/**
 * Transaction management for PostgreSQL following SPARC specification.
 *
 * Provides transaction lifecycle management, savepoints, and error handling
 * with proper connection management and observability integration.
 *
 * @module operations/transaction
 */

import { PooledConnection, ConnectionPool } from '../pool/index.js';
import {
  IsolationLevel,
  Savepoint,
  generateTransactionId,
  QueryParam,
} from '../types/index.js';
import {
  PgError,
  PgErrorCode,
  TransactionAbortedError,
  InvalidSavepointError,
  ExecutionError,
  parsePostgresError,
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
   * Whether constraints can be deferred until commit.
   * Only valid with Serializable isolation level and readOnly=true in PostgreSQL.
   * @default false
   */
  deferrable?: boolean;
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
  /** Savepoint name (must be a valid PostgreSQL identifier). */
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
   * @throws {PgError} If the name is invalid
   */
  static validateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new InvalidSavepointError(name, 'Savepoint name cannot be empty');
    }

    // PostgreSQL identifier validation: must start with letter or underscore,
    // contain only alphanumeric characters and underscores, and be <= 63 chars
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new InvalidSavepointError(
        name,
        'Must start with letter/underscore and contain only alphanumeric/underscore characters'
      );
    }

    if (name.length > 63) {
      throw new InvalidSavepointError(
        name,
        'Savepoint name exceeds PostgreSQL maximum of 63 characters'
      );
    }
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
 *
 * @example
 * ```typescript
 * const txManager = new TransactionManager(pool, observability);
 *
 * // Using begin/commit/rollback
 * const tx = await txManager.begin();
 * try {
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Alice']);
 *   await tx.execute('INSERT INTO audit_log (action) VALUES ($1)', ['user_created']);
 *   await tx.commit();
 * } catch (error) {
 *   await tx.rollback();
 *   throw error;
 * }
 *
 * // Using withTransaction helper (auto-rollback on error)
 * const result = await txManager.withTransaction(async (tx) => {
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Bob']);
 *   return tx.executeOne('SELECT id FROM users WHERE name = $1', ['Bob']);
 * });
 * ```
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

  /** Observability instance for logging and metrics. */
  private readonly observability: Observability;

  constructor(
    connection: PooledConnection,
    options: Required<TransactionOptions>,
    observability: Observability
  ) {
    this.id = generateTransactionId();
    this.connection = connection;
    this.isolation = options.isolation;
    this.readOnly = options.readOnly;
    this.startedAt = new Date();
    this.observability = observability;
  }

  /**
   * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE).
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @returns Number of rows affected
   * @throws {PgError} If the transaction is aborted or query fails
   */
  async execute(query: string, params?: QueryParam[]): Promise<number> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const result = await this.connection.client.query(query, params);
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
        rowCount: result.rowCount,
        durationMs: duration,
      });

      return result.rowCount ?? 0;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute a query and return a single row.
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @returns Single row or null if no rows found
   * @throws {PgError} If multiple rows are returned or query fails
   */
  async executeOne<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[]
  ): Promise<T | null> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const result = await this.connection.client.query(query, params);
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      this.observability.metrics.timing(
        MetricNames.QUERY_DURATION_SECONDS,
        duration,
        { operation: 'executeOne', transaction: 'true' }
      );

      if (result.rows.length === 0) {
        return null;
      }

      if (result.rows.length > 1) {
        throw new ExecutionError(`Expected single row, got ${result.rows.length} rows`);
      }

      return result.rows[0] as T;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute a query and return all rows.
   *
   * @param query - SQL query string
   * @param params - Query parameters
   * @returns Array of rows
   * @throws {PgError} If query fails
   */
  async executeMany<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[]
  ): Promise<T[]> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      const result = await this.connection.client.query(query, params);
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
        result.rows.length,
        { transaction: 'true' }
      );

      return result.rows as T[];
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
   * @param name - Savepoint name (must be valid PostgreSQL identifier)
   * @returns The created savepoint
   * @throws {PgError} If savepoint creation fails
   */
  async savepoint(name: string): Promise<Savepoint> {
    this.checkNotFinalized();
    SavepointImpl.validateName(name);

    // Check for duplicate savepoint name
    if (this.savepoints.some((sp) => sp.name === name)) {
      throw new InvalidSavepointError(name, 'Savepoint already exists');
    }

    try {
      await this.connection.client.query(`SAVEPOINT ${name}`, []);

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
   * Release a savepoint, discarding it and its effects remain.
   *
   * @param savepoint - Savepoint to release
   * @throws {PgError} If savepoint is invalid or release fails
   */
  async releaseSavepoint(savepoint: Savepoint): Promise<void> {
    this.checkNotFinalized();

    const sp = this.savepoints.find((s) => s.name === savepoint.name);
    if (!sp) {
      throw new InvalidSavepointError(savepoint.name, 'Savepoint not found in transaction');
    }

    if (sp.released) {
      throw new InvalidSavepointError(savepoint.name, 'Savepoint has already been released');
    }

    try {
      await this.connection.client.query(`RELEASE SAVEPOINT ${savepoint.name}`, []);

      this.connection.queryCount++;
      this.connection.lastUsedAt = new Date();

      sp.released = true;

      this.observability.logger.debug('Savepoint released', {
        transactionId: this.id,
        savepointName: savepoint.name,
      });
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Rollback to a savepoint, undoing changes made after it.
   *
   * @param savepoint - Savepoint to rollback to
   * @throws {PgError} If savepoint is invalid or rollback fails
   */
  async rollbackToSavepoint(savepoint: Savepoint): Promise<void> {
    this.checkNotFinalized();

    const spIndex = this.savepoints.findIndex((s) => s.name === savepoint.name);
    if (spIndex === -1) {
      throw new InvalidSavepointError(savepoint.name, 'Savepoint not found in transaction');
    }

    const sp = this.savepoints[spIndex]!;
    if (sp.released) {
      throw new InvalidSavepointError(savepoint.name, 'Cannot rollback to released savepoint');
    }

    try {
      await this.connection.client.query(`ROLLBACK TO SAVEPOINT ${savepoint.name}`, []);

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
   * @throws {PgError} If commit fails
   */
  async commit(): Promise<void> {
    this.checkNotFinalized();

    try {
      const startTime = Date.now();
      await this.connection.client.query('COMMIT', []);
      const duration = Date.now() - startTime;

      this.connection.queryCount++;
      this.connection.inTransaction = false;
      this.committed = true;
      this.connection.client.release();

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
      this.connection.client.release();

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
   * @throws {PgError} If rollback fails
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
      await this.connection.client.query('ROLLBACK', []);

      this.connection.queryCount++;
      this.connection.inTransaction = false;
      this.rolledBack = true;
      this.connection.client.release();

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
      this.connection.client.release();

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
   * @throws {PgError} If transaction is finalized or aborted
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
   *
   * Detects serialization failures and deadlocks for potential retry.
   *
   * @param error - The error that occurred
   */
  private handleError(error: unknown): void {
    const pgError = this.wrapError(error);

    // Mark transaction as aborted on certain errors
    if (
      pgError.code === PgErrorCode.SerializationFailure ||
      pgError.code === PgErrorCode.DeadlockDetected ||
      pgError.code === PgErrorCode.TransactionAborted
    ) {
      this.aborted = true;
    }

    this.observability.logger.error('Transaction error', {
      transactionId: this.id,
      errorCode: pgError.code,
      sqlState: pgError.sqlState,
      message: pgError.message,
    });

    this.observability.metrics.increment(
      MetricNames.ERRORS_TOTAL,
      1,
      { code: pgError.code, transaction: 'true' }
    );
  }

  /**
   * Wraps an error in a PgError if it isn't already.
   *
   * @param error - The error to wrap
   * @returns A PgError instance
   */
  private wrapError(error: unknown): PgError {
    if (error instanceof PgError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for PostgreSQL error code in error object
      const pgErr = error as any;
      if (pgErr.code) {
        return parsePostgresError(pgErr);
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
 *
 * The TransactionManager is responsible for:
 * - Beginning transactions with proper configuration
 * - Acquiring connections from the primary pool
 * - Providing helper methods for transaction execution
 * - Managing transaction metrics and observability
 *
 * @example
 * ```typescript
 * const manager = new TransactionManager(connectionPool, observability);
 *
 * // Manual transaction management
 * const tx = await manager.begin({ isolation: IsolationLevel.Serializable });
 * await tx.execute('UPDATE accounts SET balance = balance - 100 WHERE id = $1', [1]);
 * await tx.commit();
 *
 * // Automatic transaction management with rollback on error
 * const result = await manager.withTransaction(async (tx) => {
 *   await tx.execute('INSERT INTO orders (user_id) VALUES ($1)', [userId]);
 *   return tx.executeOne('SELECT id FROM orders WHERE user_id = $1', [userId]);
 * });
 * ```
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
   * Acquires a connection from the pool (always from primary) and executes
   * a BEGIN statement with the appropriate isolation level and modifiers.
   *
   * @param options - Transaction options
   * @returns A new Transaction instance
   * @throws {PgError} If connection acquisition or BEGIN fails
   */
  async begin(options?: TransactionOptions): Promise<Transaction> {
    const opts = this.normalizeOptions(options);

    try {
      // Acquire connection (always from primary for transactions)
      const connection = await this.pool.acquire('primary');

      // Build BEGIN statement
      const beginSql = this.buildBeginStatement(opts);

      this.observability.logger.debug('Beginning transaction', {
        isolation: opts.isolation,
        readOnly: opts.readOnly,
        deferrable: opts.deferrable,
      });

      // Execute BEGIN
      await connection.client.query(beginSql, []);
      connection.inTransaction = true;
      connection.queryCount++;
      connection.lastUsedAt = new Date();

      // Create transaction object
      const transaction = new Transaction(connection, opts, this.observability);

      this.observability.logger.info('Transaction started', {
        transactionId: transaction.id,
        isolation: opts.isolation,
      });

      return transaction;
    } catch (error) {
      this.observability.logger.error('Failed to begin transaction', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error instanceof PgError
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
   * @throws {PgError} If transaction fails or function throws
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
   *
   * @param options - User-provided options
   * @returns Complete options with defaults
   */
  private normalizeOptions(
    options?: TransactionOptions
  ): Required<TransactionOptions> {
    const isolation = options?.isolation ?? IsolationLevel.ReadCommitted;
    const readOnly = options?.readOnly ?? false;
    const deferrable = options?.deferrable ?? false;

    // Validate: deferrable is only valid with Serializable + readOnly
    if (deferrable && (!readOnly || isolation !== IsolationLevel.Serializable)) {
      this.observability.logger.warn(
        'DEFERRABLE is only valid with SERIALIZABLE isolation and READ ONLY mode. It will be ignored.'
      );
    }

    return {
      isolation,
      readOnly,
      deferrable: deferrable && readOnly && isolation === IsolationLevel.Serializable,
    };
  }

  /**
   * Builds the BEGIN statement with appropriate isolation and modifiers.
   *
   * @param options - Transaction options
   * @returns SQL BEGIN statement
   */
  private buildBeginStatement(options: Required<TransactionOptions>): string {
    const parts: string[] = ['BEGIN'];

    // Add isolation level if not default
    if (options.isolation !== IsolationLevel.ReadCommitted) {
      parts.push(`ISOLATION LEVEL ${options.isolation}`);
    }

    // Add read-only modifier
    if (options.readOnly) {
      parts.push('READ ONLY');
    }

    // Add deferrable modifier (only if serializable + read-only)
    if (options.deferrable && options.readOnly && options.isolation === IsolationLevel.Serializable) {
      parts.push('DEFERRABLE');
    }

    return parts.join(' ');
  }
}
