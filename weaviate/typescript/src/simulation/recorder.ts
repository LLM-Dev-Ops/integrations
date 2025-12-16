/**
 * Operation recording for testing and debugging
 *
 * This module provides operation recording capabilities for tracking
 * all operations performed on the mock client.
 */

import type { UUID, Properties } from '../types/property.js';
import type { Vector } from '../types/vector.js';
import type { WhereFilter } from '../types/filter.js';
import type { NearVectorQuery, HybridQuery } from '../types/search.js';

/**
 * Operation types
 */
export type OperationType =
  | 'create'
  | 'get'
  | 'update'
  | 'delete'
  | 'exists'
  | 'nearVector'
  | 'nearObject'
  | 'nearText'
  | 'hybrid'
  | 'bm25'
  | 'batchCreate'
  | 'batchDelete';

/**
 * Base operation record
 */
interface BaseOperation {
  type: OperationType;
  timestamp: number;
  className: string;
}

/**
 * Create object operation
 */
export interface CreateObjectOperation extends BaseOperation {
  type: 'create';
  id: UUID;
  properties: Properties;
  vector?: Vector;
}

/**
 * Get object operation
 */
export interface GetObjectOperation extends BaseOperation {
  type: 'get';
  id: UUID;
  found: boolean;
}

/**
 * Update object operation
 */
export interface UpdateObjectOperation extends BaseOperation {
  type: 'update';
  id: UUID;
  properties: Properties;
  merge: boolean;
}

/**
 * Delete object operation
 */
export interface DeleteObjectOperation extends BaseOperation {
  type: 'delete';
  id: UUID;
}

/**
 * Exists check operation
 */
export interface ExistsOperation extends BaseOperation {
  type: 'exists';
  id: UUID;
  exists: boolean;
}

/**
 * Near vector search operation
 */
export interface NearVectorOperation extends BaseOperation {
  type: 'nearVector';
  vector: Vector;
  limit: number;
  resultsCount: number;
}

/**
 * Near object search operation
 */
export interface NearObjectOperation extends BaseOperation {
  type: 'nearObject';
  id: UUID;
  limit: number;
  resultsCount: number;
}

/**
 * Near text search operation
 */
export interface NearTextOperation extends BaseOperation {
  type: 'nearText';
  concepts: string[];
  limit: number;
  resultsCount: number;
}

/**
 * Hybrid search operation
 */
export interface HybridOperation extends BaseOperation {
  type: 'hybrid';
  query: string;
  alpha: number;
  limit: number;
  resultsCount: number;
}

/**
 * BM25 search operation
 */
export interface BM25Operation extends BaseOperation {
  type: 'bm25';
  query: string;
  limit: number;
  resultsCount: number;
}

/**
 * Batch create operation
 */
export interface BatchCreateOperation extends BaseOperation {
  type: 'batchCreate';
  count: number;
  successful: number;
  failed: number;
}

/**
 * Batch delete operation
 */
export interface BatchDeleteOperation extends BaseOperation {
  type: 'batchDelete';
  filter: WhereFilter;
  matched: number;
  deleted: number;
}

/**
 * Union type of all recorded operations
 */
export type RecordedOperation =
  | CreateObjectOperation
  | GetObjectOperation
  | UpdateObjectOperation
  | DeleteObjectOperation
  | ExistsOperation
  | NearVectorOperation
  | NearObjectOperation
  | NearTextOperation
  | HybridOperation
  | BM25Operation
  | BatchCreateOperation
  | BatchDeleteOperation;

/**
 * Operation recorder
 *
 * Records all operations performed on the mock client for testing
 * and verification purposes.
 */
export class OperationRecorder {
  private operations: RecordedOperation[] = [];

  /**
   * Records an operation
   *
   * @param operation - The operation to record
   */
  record(operation: RecordedOperation): void {
    this.operations.push(operation);
  }

  /**
   * Gets all recorded operations
   *
   * @returns Array of recorded operations
   */
  getOperations(): RecordedOperation[] {
    return [...this.operations];
  }

  /**
   * Clears all recorded operations
   */
  clear(): void {
    this.operations = [];
  }

  /**
   * Filters operations by type
   *
   * @param type - Operation type to filter by
   * @returns Array of matching operations
   */
  filterByType(type: OperationType): RecordedOperation[] {
    return this.operations.filter((op) => op.type === type);
  }

  /**
   * Filters operations by class name
   *
   * @param className - Class name to filter by
   * @returns Array of matching operations
   */
  filterByClass(className: string): RecordedOperation[] {
    return this.operations.filter((op) => op.className === className);
  }

  /**
   * Gets the count of operations
   *
   * @param type - Optional operation type to count
   * @returns Number of operations
   */
  count(type?: OperationType): number {
    if (type) {
      return this.filterByType(type).length;
    }
    return this.operations.length;
  }

  /**
   * Gets the most recent operation
   *
   * @param type - Optional operation type to filter by
   * @returns Most recent operation or undefined
   */
  getLastOperation(type?: OperationType): RecordedOperation | undefined {
    const ops = type ? this.filterByType(type) : this.operations;
    return ops[ops.length - 1];
  }

  /**
   * Checks if an operation of the specified type was recorded
   *
   * @param type - Operation type
   * @returns True if at least one operation of this type was recorded
   */
  hasOperation(type: OperationType): boolean {
    return this.operations.some((op) => op.type === type);
  }

  /**
   * Gets operations within a time range
   *
   * @param startTime - Start timestamp (milliseconds)
   * @param endTime - End timestamp (milliseconds)
   * @returns Array of operations within the time range
   */
  getOperationsInRange(startTime: number, endTime: number): RecordedOperation[] {
    return this.operations.filter(
      (op) => op.timestamp >= startTime && op.timestamp <= endTime
    );
  }
}
