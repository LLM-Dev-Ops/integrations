/**
 * DynamoDB Item types following SPARC specification.
 *
 * Defines item structures and consumed capacity tracking.
 */

import type { AttributeValue } from './key.js';

// ============================================================================
// Item Types
// ============================================================================

/**
 * DynamoDB item - a record with string keys and attribute values.
 *
 * Represents a single item (row/document) in a DynamoDB table.
 * Each item is a collection of attributes (key-value pairs).
 */
export type Item = Record<string, AttributeValue>;

// ============================================================================
// Capacity Types
// ============================================================================

/**
 * Consumed capacity information for DynamoDB operations.
 *
 * Tracks read/write capacity units consumed by operations.
 * Useful for monitoring costs and performance.
 */
export interface ConsumedCapacity {
  /** Capacity consumed at the table level */
  tableCapacity?: number;
  /** Capacity consumed per global secondary index */
  globalSecondaryIndexCapacity?: Record<string, number>;
}
