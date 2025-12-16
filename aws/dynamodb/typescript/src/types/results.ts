/**
 * DynamoDB operation result types following SPARC specification.
 *
 * Defines result interfaces for all DynamoDB operations including
 * single-item, query, scan, and batch operations.
 */

import type { AttributeValue, Key } from './key.js';
import type { ConsumedCapacity } from './item.js';

// ============================================================================
// Single Item Operation Results
// ============================================================================

/**
 * Result of GetItem operation.
 *
 * @template T - Type of the returned item
 */
export interface GetItemResult<T> {
  /** Retrieved item (undefined if not found) */
  item?: T;
  /** Consumed read capacity information */
  consumedCapacity?: ConsumedCapacity;
}

/**
 * Result of PutItem operation.
 *
 * @template T - Type of the returned item
 */
export interface PutItemResult<T> {
  /** Previous item (if returnOldValues was true and item existed) */
  oldItem?: T;
  /** Consumed write capacity information */
  consumedCapacity?: ConsumedCapacity;
}

/**
 * Result of UpdateItem operation.
 *
 * @template T - Type of the returned item
 */
export interface UpdateItemResult<T> {
  /** Updated attributes (based on returnNewValues/returnOldValues) */
  attributes?: T;
  /** Consumed write capacity information */
  consumedCapacity?: ConsumedCapacity;
}

/**
 * Result of DeleteItem operation.
 *
 * @template T - Type of the returned item
 */
export interface DeleteItemResult<T> {
  /** Deleted item (if returnOldValues was true) */
  oldItem?: T;
  /** Consumed write capacity information */
  consumedCapacity?: ConsumedCapacity;
}

// ============================================================================
// Query and Scan Results
// ============================================================================

/**
 * Result of Query operation.
 *
 * @template T - Type of items in the result set
 */
export interface QueryResult<T> {
  /** Array of items matching the query */
  items: T[];
  /** Pagination token for next page (undefined if no more results) */
  lastEvaluatedKey?: Record<string, AttributeValue>;
  /** Number of items returned (after filter) */
  count: number;
  /** Number of items examined (before filter) */
  scannedCount: number;
  /** Consumed read capacity information */
  consumedCapacity?: ConsumedCapacity;
}

/**
 * Result of Scan operation.
 *
 * @template T - Type of items in the result set
 */
export interface ScanResult<T> extends QueryResult<T> {}

// ============================================================================
// Batch Operation Results
// ============================================================================

/**
 * Result of BatchGetItem operation.
 *
 * @template T - Type of items in the result set
 */
export interface BatchGetResult<T> {
  /** Array of retrieved items */
  items: T[];
  /** Keys that were not processed (due to throttling or errors) */
  unprocessedKeys?: Key[];
  /** Consumed capacity per table */
  consumedCapacity?: ConsumedCapacity[];
}

/**
 * Result of BatchWriteItem operation.
 */
export interface BatchWriteResult {
  /** Number of items successfully processed */
  processedCount: number;
  /** Write requests that were not processed */
  unprocessedItems?: WriteRequest[];
  /** Consumed capacity per table */
  consumedCapacity?: ConsumedCapacity[];
}

/**
 * Write request for batch operations.
 */
export type WriteRequest =
  | {
      /** Put operation */
      type: 'put';
      /** Item to put */
      item: Record<string, AttributeValue>;
    }
  | {
      /** Delete operation */
      type: 'delete';
      /** Key of item to delete */
      key: Key;
    };
