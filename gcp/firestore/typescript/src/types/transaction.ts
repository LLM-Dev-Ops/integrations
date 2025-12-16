/**
 * Transaction types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents transactions, transaction options, and transaction identifiers.
 */

import { Write } from "./batch.js";
import { Timestamp } from "./document.js";

/**
 * Transaction ID - opaque identifier for a transaction.
 */
export type TransactionId = string;

/**
 * Transaction mode.
 */
export type TransactionMode = "read_write" | "read_only";

/**
 * Read-only transaction options.
 */
export interface ReadOnlyOptions {
  /** Read at a specific time (optional) */
  readTime?: Timestamp;
}

/**
 * Read-write transaction options.
 */
export interface ReadWriteOptions {
  /** Previous transaction to retry (optional) */
  retryTransaction?: TransactionId;
}

/**
 * Transaction options.
 */
export interface TransactionOptions {
  /** Whether this is a read-only transaction */
  read_only?: boolean;
  /** Maximum number of retry attempts */
  max_attempts?: number;
  /** Read-only specific options */
  readOnlyOptions?: ReadOnlyOptions;
  /** Read-write specific options */
  readWriteOptions?: ReadWriteOptions;
}

/**
 * Transaction state.
 */
export interface Transaction {
  /** Transaction identifier */
  id: TransactionId;
  /** Whether this is read-only */
  read_only: boolean;
  /** Time the transaction was started */
  read_time?: Timestamp;
  /** Maximum number of attempts for this transaction */
  max_attempts: number;
  /** Current attempt number */
  current_attempt: number;
  /** Transaction mode */
  mode: TransactionMode;
}

/**
 * Transaction result.
 */
export interface TransactionResult {
  /** Transaction ID */
  transaction_id: TransactionId;
  /** Commit time (for read-write transactions) */
  commit_time?: Timestamp;
  /** Whether the transaction succeeded */
  success: boolean;
  /** Number of writes committed */
  writes_committed?: number;
}

/**
 * Transaction context for operations within a transaction.
 */
export interface TransactionContext {
  /** Active transaction */
  transaction: Transaction;
  /** Accumulated writes (for read-write transactions) */
  writes: Write[];
  /** Whether the transaction has been committed */
  committed: boolean;
  /** Whether the transaction has been rolled back */
  rolledBack: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create default transaction options.
 */
export function createTransactionOptions(
  read_only: boolean = false,
  max_attempts: number = 5
): TransactionOptions {
  return { read_only, max_attempts };
}

/**
 * Create read-only transaction options.
 */
export function createReadOnlyOptions(
  readTime?: Timestamp
): TransactionOptions {
  return {
    read_only: true,
    readOnlyOptions: { readTime },
  };
}

/**
 * Create read-write transaction options.
 */
export function createReadWriteOptions(
  retryTransaction?: TransactionId,
  max_attempts: number = 5
): TransactionOptions {
  return {
    read_only: false,
    max_attempts,
    readWriteOptions: { retryTransaction },
  };
}

/**
 * Create a transaction.
 */
export function createTransaction(
  id: TransactionId,
  options: TransactionOptions = {}
): Transaction {
  const read_only = options.read_only ?? false;
  const max_attempts = options.max_attempts ?? 5;

  return {
    id,
    read_only,
    read_time: options.readOnlyOptions?.readTime,
    max_attempts,
    current_attempt: 1,
    mode: read_only ? "read_only" : "read_write",
  };
}

/**
 * Create a transaction context.
 */
export function createTransactionContext(
  transaction: Transaction
): TransactionContext {
  return {
    transaction,
    writes: [],
    committed: false,
    rolledBack: false,
  };
}

/**
 * Add a write to a transaction context.
 */
export function addTransactionWrite(
  context: TransactionContext,
  write: Write
): TransactionContext {
  if (context.transaction.read_only) {
    throw new Error("Cannot write in a read-only transaction");
  }

  if (context.committed) {
    throw new Error("Cannot add writes to a committed transaction");
  }

  if (context.rolledBack) {
    throw new Error("Cannot add writes to a rolled-back transaction");
  }

  return {
    ...context,
    writes: [...context.writes, write],
  };
}

/**
 * Mark a transaction as committed.
 */
export function commitTransaction(
  context: TransactionContext
): TransactionContext {
  if (context.committed) {
    throw new Error("Transaction already committed");
  }

  if (context.rolledBack) {
    throw new Error("Cannot commit a rolled-back transaction");
  }

  return {
    ...context,
    committed: true,
  };
}

/**
 * Mark a transaction as rolled back.
 */
export function rollbackTransaction(
  context: TransactionContext
): TransactionContext {
  if (context.committed) {
    throw new Error("Cannot rollback a committed transaction");
  }

  return {
    ...context,
    rolledBack: true,
  };
}

/**
 * Check if a transaction can be retried.
 */
export function canRetryTransaction(transaction: Transaction): boolean {
  return transaction.current_attempt < transaction.max_attempts;
}

/**
 * Increment transaction attempt counter.
 */
export function incrementAttempt(transaction: Transaction): Transaction {
  return {
    ...transaction,
    current_attempt: transaction.current_attempt + 1,
  };
}

/**
 * Check if a transaction is active.
 */
export function isTransactionActive(context: TransactionContext): boolean {
  return !context.committed && !context.rolledBack;
}

/**
 * Get the number of writes in a transaction.
 */
export function getTransactionWriteCount(context: TransactionContext): number {
  return context.writes.length;
}

/**
 * Create a transaction result.
 */
export function createTransactionResult(
  transaction_id: TransactionId,
  success: boolean,
  commit_time?: Timestamp,
  writes_committed?: number
): TransactionResult {
  return {
    transaction_id,
    success,
    commit_time,
    writes_committed,
  };
}

/**
 * Create a successful transaction result.
 */
export function successfulTransaction(
  transaction_id: TransactionId,
  commit_time: Timestamp,
  writes_committed: number
): TransactionResult {
  return createTransactionResult(
    transaction_id,
    true,
    commit_time,
    writes_committed
  );
}

/**
 * Create a failed transaction result.
 */
export function failedTransaction(transaction_id: TransactionId): TransactionResult {
  return createTransactionResult(transaction_id, false);
}
