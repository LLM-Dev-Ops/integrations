/**
 * Weaviate batch operation types
 *
 * This module defines types for batch create, update, and delete operations
 * which allow efficient bulk data manipulation.
 */

import type { UUID, Properties } from './property.js';
import type { Vector } from './vector.js';
import type { WhereFilter } from './filter.js';

/**
 * Consistency level for batch operations
 *
 * Determines how many replicas must acknowledge an operation.
 */
export enum ConsistencyLevel {
  /**
   * Only one replica must acknowledge (fastest, least consistent)
   */
  One = 'ONE',

  /**
   * Majority of replicas must acknowledge (balanced, recommended)
   */
  Quorum = 'QUORUM',

  /**
   * All replicas must acknowledge (slowest, most consistent)
   */
  All = 'ALL',
}

/**
 * Batch object for creation
 *
 * @example
 * ```typescript
 * const obj: BatchObject = {
 *   className: "Article",
 *   properties: {
 *     title: "My Article",
 *     content: "Article content..."
 *   },
 *   vector: [0.1, 0.2, 0.3, ...]
 * };
 * ```
 */
export interface BatchObject {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Custom UUID (auto-generated if not provided)
   */
  id?: UUID;

  /**
   * Object properties
   */
  properties: Properties;

  /**
   * Vector embedding (optional if vectorizer is configured)
   */
  vector?: Vector;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Named vectors (for multi-vector support)
   */
  vectors?: Record<string, Vector>;
}

/**
 * Batch create request
 *
 * @example
 * ```typescript
 * const request: BatchRequest = {
 *   objects: [
 *     {
 *       className: "Article",
 *       properties: { title: "Article 1" }
 *     },
 *     {
 *       className: "Article",
 *       properties: { title: "Article 2" }
 *     }
 *   ],
 *   consistencyLevel: ConsistencyLevel.Quorum
 * };
 * ```
 */
export interface BatchRequest {
  /**
   * Array of objects to create
   */
  objects: BatchObject[];

  /**
   * Consistency level for the batch operation
   * Default: Quorum
   */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Batch error - information about a failed object in batch
 */
export interface BatchError {
  /**
   * Index of the failed object in the batch
   */
  index: number;

  /**
   * Object UUID (if available)
   */
  objectId?: UUID;

  /**
   * Error message
   */
  errorMessage: string;

  /**
   * Error code
   */
  errorCode?: string;

  /**
   * Original object that failed (optional)
   */
  object?: BatchObject;
}

/**
 * Result for a single batch object
 */
export interface BatchObjectResult {
  /**
   * Object UUID
   */
  id: UUID;

  /**
   * Class name
   */
  className: string;

  /**
   * Creation timestamp
   */
  creationTime?: Date;

  /**
   * Status of the operation
   */
  status?: 'SUCCESS' | 'PENDING' | 'FAILED';

  /**
   * Error information (if failed)
   */
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Batch create response
 *
 * @example
 * ```typescript
 * const response: BatchResponse = {
 *   successful: 98,
 *   failed: 2,
 *   results: [...],
 *   errors: [
 *     {
 *       index: 5,
 *       objectId: "...",
 *       errorMessage: "Invalid property value"
 *     }
 *   ]
 * };
 * ```
 */
export interface BatchResponse {
  /**
   * Number of successfully created objects
   */
  successful: number;

  /**
   * Number of failed objects
   */
  failed: number;

  /**
   * Detailed results for each object
   */
  results?: BatchObjectResult[];

  /**
   * Array of errors for failed objects
   */
  errors?: BatchError[];

  /**
   * Elapsed time in milliseconds
   */
  elapsedMs?: number;
}

/**
 * Batch delete request
 *
 * Deletes all objects matching the specified filter.
 *
 * @example
 * ```typescript
 * const request: BatchDeleteRequest = {
 *   className: "Article",
 *   filter: {
 *     operator: 'Operand',
 *     operand: {
 *       path: ['status'],
 *       operator: FilterOperator.Equal,
 *       value: 'archived'
 *     }
 *   },
 *   dryRun: false
 * };
 * ```
 */
export interface BatchDeleteRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Filter to select objects for deletion
   */
  filter: WhereFilter;

  /**
   * If true, only count matches without deleting
   * Default: false
   */
  dryRun?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Consistency level for the operation
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * Output level for response
   */
  output?: 'minimal' | 'verbose';
}

/**
 * Batch delete response
 *
 * @example
 * ```typescript
 * const response: BatchDeleteResponse = {
 *   matched: 150,
 *   deleted: 150,
 *   dryRun: false,
 *   successful: true
 * };
 * ```
 */
export interface BatchDeleteResponse {
  /**
   * Number of objects matched by the filter
   */
  matched: number;

  /**
   * Number of objects actually deleted
   */
  deleted: number;

  /**
   * Whether this was a dry run
   */
  dryRun: boolean;

  /**
   * Whether the operation succeeded
   */
  successful?: boolean;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Detailed results (if output=verbose)
   */
  results?: {
    /**
     * Successfully deleted object IDs
     */
    successful?: UUID[];

    /**
     * Failed deletions with errors
     */
    failed?: Array<{
      id: UUID;
      error: string;
    }>;
  };

  /**
   * Elapsed time in milliseconds
   */
  elapsedMs?: number;
}

/**
 * Batch update request
 */
export interface BatchUpdateRequest {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Filter to select objects for update
   */
  filter: WhereFilter;

  /**
   * Properties to update
   */
  properties?: Properties;

  /**
   * Vector to set
   */
  vector?: Vector;

  /**
   * Whether to merge with existing properties (true) or replace (false)
   */
  merge?: boolean;

  /**
   * Tenant name
   */
  tenant?: string;

  /**
   * Consistency level
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * If true, only count matches without updating
   */
  dryRun?: boolean;
}

/**
 * Batch update response
 */
export interface BatchUpdateResponse {
  /**
   * Number of objects matched
   */
  matched: number;

  /**
   * Number of objects updated
   */
  updated: number;

  /**
   * Whether this was a dry run
   */
  dryRun: boolean;

  /**
   * Whether the operation succeeded
   */
  successful?: boolean;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Elapsed time in milliseconds
   */
  elapsedMs?: number;
}

/**
 * Batch reference request
 */
export interface BatchReferenceRequest {
  /**
   * References to add
   */
  references: Array<{
    /**
     * Source object class
     */
    fromClassName: string;

    /**
     * Source object ID
     */
    fromId: UUID;

    /**
     * Property name for the reference
     */
    fromProperty: string;

    /**
     * Target object class
     */
    toClassName: string;

    /**
     * Target object ID
     */
    toId: UUID;

    /**
     * Tenant name
     */
    tenant?: string;
  }>;

  /**
   * Consistency level
   */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Batch reference response
 */
export interface BatchReferenceResponse {
  /**
   * Number of successfully added references
   */
  successful: number;

  /**
   * Number of failed references
   */
  failed: number;

  /**
   * Errors for failed references
   */
  errors?: BatchError[];
}

/**
 * Batch operation status
 */
export interface BatchStatus {
  /**
   * Batch operation ID
   */
  id: string;

  /**
   * Status of the batch
   */
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

  /**
   * Progress information
   */
  progress?: {
    /**
     * Total objects in batch
     */
    total: number;

    /**
     * Objects processed so far
     */
    processed: number;

    /**
     * Successfully processed
     */
    successful: number;

    /**
     * Failed so far
     */
    failed: number;
  };

  /**
   * Start time
   */
  startedAt?: Date;

  /**
   * Completion time
   */
  completedAt?: Date;

  /**
   * Error message (if failed)
   */
  error?: string;
}
