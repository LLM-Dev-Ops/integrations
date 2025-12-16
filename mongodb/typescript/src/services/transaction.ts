/**
 * MongoDB transaction and session management service following SPARC specification.
 *
 * Provides session management and transaction handling with automatic retry logic
 * for transient errors and unknown commit results.
 */

import type { ClientSession, ReadPreferenceLike, TransactionOptions as MongoTransactionOptions } from 'mongodb';
import { ReadConcernLevel, WriteConcernOptions } from '../config/index.js';
import {
  TransactionError,
  TransactionAbortedError,
  WriteConflictError,
} from '../errors/index.js';
import { MetricNames } from '../observability/index.js';

// ============================================================================
// Session and Transaction Options
// ============================================================================

/**
 * Options for starting a MongoDB session.
 */
export interface SessionOptions {
  /** Enable causal consistency for this session */
  causalConsistency?: boolean;
  /** Default transaction options for this session */
  defaultTransactionOptions?: TransactionOptions;
}

/**
 * Options for transaction configuration.
 */
export interface TransactionOptions {
  /** Read concern level for the transaction */
  readConcern?: { level: ReadConcernLevel };
  /** Write concern options for the transaction */
  writeConcern?: WriteConcernOptions;
  /** Read preference for the transaction */
  readPreference?: ReadPreferenceLike;
  /** Maximum time to wait for commit in milliseconds */
  maxCommitTimeMs?: number;
}

// ============================================================================
// Session Wrapper
// ============================================================================

/**
 * MongoDBClient interface that provides session creation.
 * This will be implemented by the actual MongoDB client.
 */
export interface MongoDBClient {
  /** Start a new session */
  startSession(options?: SessionOptions): Promise<ClientSession>;
  /** Get observability components */
  observability?: {
    metrics: {
      increment(name: string, value?: number, tags?: Record<string, string>): void;
      timing(name: string, durationMs: number, tags?: Record<string, string>): void;
    };
    logger: {
      debug(message: string, context?: Record<string, unknown>): void;
      info(message: string, context?: Record<string, unknown>): void;
      warn(message: string, context?: Record<string, unknown>): void;
      error(message: string, context?: Record<string, unknown>): void;
    };
  };
}

/**
 * Wrapper around MongoDB ClientSession providing a cleaner API.
 */
export class SessionWrapper {
  private readonly session: ClientSession;
  private readonly client: MongoDBClient;

  constructor(session: ClientSession, client: MongoDBClient) {
    this.session = session;
    this.client = client;
  }

  /**
   * Gets the session ID.
   */
  get id(): string {
    return this.session.id.toString();
  }

  /**
   * Gets the underlying MongoDB driver session.
   * Use with caution - prefer using SessionWrapper methods.
   */
  get driverSession(): ClientSession {
    return this.session;
  }

  /**
   * Starts a transaction on this session.
   * @param options - Transaction options
   */
  startTransaction(options?: TransactionOptions): void {
    this.client.observability?.logger.debug('Starting transaction', {
      sessionId: this.id,
      options,
    });

    this.session.startTransaction(options);

    this.client.observability?.metrics.increment(MetricNames.TRANSACTIONS_TOTAL, 1, {
      operation: 'start',
    });
  }

  /**
   * Commits the current transaction.
   * @throws TransactionError if commit fails
   */
  async commitTransaction(): Promise<void> {
    const startTime = Date.now();

    try {
      this.client.observability?.logger.debug('Committing transaction', {
        sessionId: this.id,
      });

      await this.session.commitTransaction();

      const duration = Date.now() - startTime;
      this.client.observability?.metrics.timing(MetricNames.OPERATION_LATENCY, duration, {
        operation: 'transaction_commit',
      });

      this.client.observability?.metrics.increment(MetricNames.TRANSACTIONS_COMMITTED, 1);

      this.client.observability?.logger.debug('Transaction committed successfully', {
        sessionId: this.id,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.client.observability?.metrics.timing(MetricNames.OPERATION_LATENCY, duration, {
        operation: 'transaction_commit',
        status: 'error',
      });

      this.client.observability?.logger.error('Transaction commit failed', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TransactionError(
        `Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Aborts the current transaction.
   */
  async abortTransaction(): Promise<void> {
    try {
      this.client.observability?.logger.debug('Aborting transaction', {
        sessionId: this.id,
      });

      await this.session.abortTransaction();

      this.client.observability?.metrics.increment(MetricNames.TRANSACTIONS_ABORTED, 1);

      this.client.observability?.logger.debug('Transaction aborted successfully', {
        sessionId: this.id,
      });
    } catch (error) {
      this.client.observability?.logger.error('Transaction abort failed', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TransactionError(
        `Failed to abort transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Checks if the session currently has an active transaction.
   */
  inTransaction(): boolean {
    return this.session.inTransaction();
  }

  /**
   * Ends the session and releases resources.
   */
  async endSession(): Promise<void> {
    try {
      this.client.observability?.logger.debug('Ending session', {
        sessionId: this.id,
      });

      await this.session.endSession();

      this.client.observability?.logger.debug('Session ended successfully', {
        sessionId: this.id,
      });
    } catch (error) {
      this.client.observability?.logger.error('Failed to end session', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TransactionError(
        `Failed to end session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Executes a function within a transaction with automatic retry logic.
   *
   * Handles:
   * - TransientTransactionError: Retries the entire transaction
   * - UnknownTransactionCommitResult: Retries just the commit
   * - Automatic cleanup on success or failure
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns Result of the function
   */
  async withTransaction<T>(
    fn: (session: SessionWrapper) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const maxRetries = 3;
    const maxCommitRetries = 3;
    let transactionRetries = 0;

    while (transactionRetries < maxRetries) {
      this.startTransaction(options);

      try {
        // Execute the transaction function
        const result = await fn(this);

        // Try to commit with retry logic for unknown commit results
        let commitRetries = 0;
        let commitSucceeded = false;

        while (commitRetries < maxCommitRetries && !commitSucceeded) {
          try {
            await this.commitTransaction();
            commitSucceeded = true;
            return result;
          } catch (commitError) {
            // Check if this is an UnknownTransactionCommitResult error
            const errorMessage =
              commitError instanceof Error ? commitError.message : String(commitError);
            const errorLabels = (commitError as any)?.errorLabels || [];

            if (errorLabels.includes('UnknownTransactionCommitResult')) {
              commitRetries++;
              this.client.observability?.logger.warn('Unknown transaction commit result, retrying', {
                sessionId: this.id,
                attempt: commitRetries,
                maxRetries: maxCommitRetries,
              });

              if (commitRetries >= maxCommitRetries) {
                this.client.observability?.logger.error('Max commit retries exceeded', {
                  sessionId: this.id,
                  attempts: commitRetries,
                });
                throw new TransactionError('Transaction commit failed after multiple retries');
              }

              // Wait before retrying commit
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, commitRetries) * 100));
              continue;
            }

            // Not a retriable commit error
            throw commitError;
          }
        }
      } catch (error) {
        // Abort the transaction on error
        try {
          await this.abortTransaction();
        } catch (abortError) {
          this.client.observability?.logger.error('Failed to abort transaction after error', {
            sessionId: this.id,
            originalError: error instanceof Error ? error.message : String(error),
            abortError: abortError instanceof Error ? abortError.message : String(abortError),
          });
        }

        // Check if this is a TransientTransactionError
        const errorLabels = (error as any)?.errorLabels || [];

        if (errorLabels.includes('TransientTransactionError')) {
          transactionRetries++;
          this.client.observability?.logger.warn('Transient transaction error, retrying', {
            sessionId: this.id,
            attempt: transactionRetries,
            maxRetries,
            error: error instanceof Error ? error.message : String(error),
          });

          if (transactionRetries >= maxRetries) {
            this.client.observability?.logger.error('Max transaction retries exceeded', {
              sessionId: this.id,
              attempts: transactionRetries,
            });
            throw new TransactionError('Transaction failed after multiple retries');
          }

          // Wait before retrying transaction
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, transactionRetries) * 100));
          continue;
        }

        // Check for write conflict
        const errorCode = (error as any)?.code;
        if (errorCode === 112) {
          // WriteConflict error code
          throw new WriteConflictError();
        }

        // Not a retriable transaction error
        if (error instanceof TransactionError || error instanceof TransactionAbortedError) {
          throw error;
        }

        throw new TransactionError(
          `Transaction failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    throw new TransactionError('Transaction failed after maximum retry attempts');
  }
}

// ============================================================================
// Transaction Manager
// ============================================================================

/**
 * Manages MongoDB sessions and transactions.
 */
export class TransactionManager {
  private readonly client: MongoDBClient;

  constructor(client: MongoDBClient) {
    this.client = client;
  }

  /**
   * Starts a new MongoDB session.
   *
   * @param options - Session options
   * @returns SessionWrapper instance
   */
  async startSession(options?: SessionOptions): Promise<SessionWrapper> {
    try {
      this.client.observability?.logger.debug('Starting new session', { options });

      const session = await this.client.startSession(options);
      const wrapper = new SessionWrapper(session, this.client);

      this.client.observability?.logger.debug('Session started successfully', {
        sessionId: wrapper.id,
      });

      this.client.observability?.metrics.increment(MetricNames.CONNECTIONS_TOTAL, 1, {
        type: 'session',
      });

      return wrapper;
    } catch (error) {
      this.client.observability?.logger.error('Failed to start session', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TransactionError(
        `Failed to start session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Executes a function with a new session.
   * The session is automatically ended when the function completes.
   *
   * @param options - Session options
   * @param fn - Function to execute with the session
   * @returns Result of the function
   */
  async withSession<T>(
    options: SessionOptions | ((session: SessionWrapper) => Promise<T>),
    fn?: (session: SessionWrapper) => Promise<T>
  ): Promise<T> {
    // Support both withSession(fn) and withSession(options, fn)
    const actualOptions = typeof options === 'function' ? undefined : options;
    const actualFn = typeof options === 'function' ? options : fn!;

    const session = await this.startSession(actualOptions);

    try {
      const result = await actualFn(session);
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Executes a function within a transaction.
   * Creates a new session, starts a transaction, executes the function,
   * and commits the transaction. Handles retries and cleanup automatically.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   * @returns Result of the function
   */
  async withTransaction<T>(
    fn: (session: SessionWrapper) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    return this.withSession(async session => {
      return session.withTransaction(fn, options);
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convenience function to run a function within a transaction.
 *
 * This is a standalone helper that creates a session, executes the transaction,
 * and handles all cleanup automatically.
 *
 * @param client - MongoDB client instance
 * @param fn - Function to execute within the transaction
 * @param options - Transaction options
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const result = await runInTransaction(client, async (session) => {
 *   await collection.insertOne({ name: 'test' }, { session: session.driverSession });
 *   await otherCollection.updateOne(
 *     { _id: 'some-id' },
 *     { $set: { updated: true } },
 *     { session: session.driverSession }
 *   );
 *   return 'success';
 * });
 * ```
 */
export async function runInTransaction<T>(
  client: MongoDBClient,
  fn: (session: SessionWrapper) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const manager = new TransactionManager(client);
  return manager.withTransaction(fn, options);
}
