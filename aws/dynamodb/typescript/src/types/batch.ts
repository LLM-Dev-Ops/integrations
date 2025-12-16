/**
 * DynamoDB batch and transaction types following SPARC specification.
 *
 * Defines types for batch write operations and transactional operations.
 */

import type { Key } from './key.js';
import type { Item } from './item.js';

// ============================================================================
// Batch Write Types
// ============================================================================

/**
 * Write request for batch write operations.
 *
 * Represents either a put or delete operation in a batch.
 */
export type WriteRequest =
  | {
      /** Put operation - writes an item */
      type: 'put';
      /** Item to write to the table */
      item: Item;
    }
  | {
      /** Delete operation - removes an item */
      type: 'delete';
      /** Key of the item to delete */
      key: Key;
    };

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Item for transactional write operations.
 *
 * Supports put, update, delete, and condition check operations.
 * All operations in a transaction succeed or fail together.
 */
export interface TransactWriteItem {
  /** Type of transactional operation */
  type: 'put' | 'update' | 'delete' | 'conditionCheck';
  /** Name of the table to operate on */
  tableName: string;
  /** Key of the item (required for update, delete, conditionCheck) */
  key?: Key;
  /** Item to write (required for put) */
  item?: Item;
  /** Update expression (required for update) */
  updateExpression?: string;
  /** Condition expression (optional for all types, required for conditionCheck) */
  conditionExpression?: string;
}

/**
 * Item for transactional get operations.
 *
 * Represents a single get operation in a transaction.
 * All gets are performed with serializable isolation.
 */
export interface TransactGetItem {
  /** Name of the table to read from */
  tableName: string;
  /** Key of the item to retrieve */
  key: Key;
  /** Projection expression - comma-separated list of attributes to return */
  projection?: string;
}
