/**
 * DynamoDB operation options following SPARC specification.
 *
 * Defines option interfaces for all DynamoDB operations including
 * get, put, update, delete, query, and scan operations.
 */

import type { AttributeValue } from './key.js';

// ============================================================================
// Read Operation Options
// ============================================================================

/**
 * Options for GetItem operations.
 *
 * Controls read consistency, projections, and capacity tracking.
 */
export interface GetItemOptions {
  /** Use strongly consistent reads (default: eventually consistent) */
  consistentRead?: boolean;
  /** Projection expression - comma-separated list of attributes to return */
  projection?: string;
  /** Expression attribute names mapping (for reserved words or special chars) */
  expressionNames?: Record<string, string>;
  /** Return consumed read capacity information */
  returnConsumedCapacity?: boolean;
}

/**
 * Options for Query operations.
 *
 * Controls filtering, pagination, ordering, and index usage.
 */
export interface QueryOptions {
  /** Name of the global/local secondary index to query */
  indexName?: string;
  /** Maximum number of items to return */
  limit?: number;
  /** Sort order: true = ascending, false = descending (default: true) */
  scanForward?: boolean;
  /** Use strongly consistent reads (not available for GSI) */
  consistentRead?: boolean;
  /** Filter expression to apply after query (post-filter) */
  filterExpression?: string;
  /** Projection expression - comma-separated list of attributes to return */
  projection?: string;
  /** Pagination token from previous query result */
  exclusiveStartKey?: Record<string, AttributeValue>;
}

/**
 * Options for Scan operations.
 *
 * Controls filtering, pagination, and parallel scanning.
 */
export interface ScanOptions {
  /** Name of the global/local secondary index to scan */
  indexName?: string;
  /** Maximum number of items to return */
  limit?: number;
  /** Filter expression to apply during scan */
  filterExpression?: string;
  /** Projection expression - comma-separated list of attributes to return */
  projection?: string;
  /** Pagination token from previous scan result */
  exclusiveStartKey?: Record<string, AttributeValue>;
  /** Segment number for parallel scans (0-based) */
  segment?: number;
  /** Total number of segments for parallel scans */
  totalSegments?: number;
}

// ============================================================================
// Write Operation Options
// ============================================================================

/**
 * Options for PutItem operations.
 *
 * Controls conditional writes and return values.
 */
export interface PutItemOptions {
  /** Condition expression that must be true for put to succeed */
  conditionExpression?: string;
  /** Expression attribute names mapping */
  expressionNames?: Record<string, string>;
  /** Expression attribute values for condition expression */
  expressionValues?: Record<string, AttributeValue>;
  /** Return the old item if it existed */
  returnOldValues?: boolean;
}

/**
 * Options for UpdateItem operations.
 *
 * Controls conditional updates and return values.
 */
export interface UpdateItemOptions {
  /** Condition expression that must be true for update to succeed */
  conditionExpression?: string;
  /** Return the item after update is applied */
  returnNewValues?: boolean;
  /** Return the item before update was applied */
  returnOldValues?: boolean;
}

/**
 * Options for DeleteItem operations.
 *
 * Controls conditional deletes and return values.
 */
export interface DeleteItemOptions {
  /** Condition expression that must be true for delete to succeed */
  conditionExpression?: string;
  /** Expression attribute names mapping */
  expressionNames?: Record<string, string>;
  /** Expression attribute values for condition expression */
  expressionValues?: Record<string, AttributeValue>;
  /** Return the old item before deletion */
  returnOldValues?: boolean;
}
