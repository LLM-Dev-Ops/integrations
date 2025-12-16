/**
 * DynamoDB type definitions following SPARC specification.
 *
 * Provider-agnostic key-value store interfaces for DynamoDB operations.
 * Supports single-item operations, queries, scans, batch operations,
 * and transactions.
 */

// ============================================================================
// Key and Attribute Types
// ============================================================================

export type { AttributeValue, Key } from './key.js';
export { createKey, withSortKey, toKeyMap } from './key.js';

// ============================================================================
// Item Types
// ============================================================================

export type { Item, ConsumedCapacity } from './item.js';

// ============================================================================
// Operation Options
// ============================================================================

export type {
  GetItemOptions,
  PutItemOptions,
  UpdateItemOptions,
  DeleteItemOptions,
  QueryOptions,
  ScanOptions,
} from './options.js';

// ============================================================================
// Operation Results
// ============================================================================

export type {
  GetItemResult,
  PutItemResult,
  UpdateItemResult,
  DeleteItemResult,
  QueryResult,
  ScanResult,
  BatchGetResult,
  BatchWriteResult,
} from './results.js';

// Re-export WriteRequest from results for convenience
export type { WriteRequest } from './results.js';

// ============================================================================
// Batch and Transaction Types
// ============================================================================

export type { TransactWriteItem, TransactGetItem } from './batch.js';
