/**
 * HubSpot Batch Operation Types
 * Type definitions for batch create, read, update, and archive operations
 */

import type { CrmObject, Properties, ObjectType, CreateInput, UpdateInput } from './objects.js';

/**
 * Result from a batch operation
 */
export interface BatchResult<T = CrmObject> {
  /** Successfully processed results */
  results: T[];

  /** Errors encountered during processing */
  errors: BatchError[];

  /** Overall batch status */
  status?: 'COMPLETE' | 'PARTIAL' | 'FAILED';

  /** Number of requested operations */
  numErrors?: number;

  /** Processing timestamp */
  startedAt?: Date;

  /** Completion timestamp */
  completedAt?: Date;
}

/**
 * Error from a batch operation
 */
export interface BatchError {
  /** Object ID that caused the error (if available) */
  id?: string;

  /** Error message */
  message: string;

  /** Error category */
  category: ErrorCategory;

  /** HTTP status code */
  status?: string;

  /** Additional error context */
  context?: ErrorContext;

  /** Sub-category of the error */
  subCategory?: string;

  /** Links to documentation */
  links?: {
    'knowledge-base'?: string;
  };
}

/**
 * Error category types
 */
export type ErrorCategory =
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT'
  | 'OBJECT_NOT_FOUND'
  | 'AUTHORIZATION'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | string;

/**
 * Error context with additional details
 */
export interface ErrorContext {
  /** Missing required fields */
  missingFields?: string[];

  /** Invalid property names */
  invalidProperties?: string[];

  /** Conflicting property values */
  conflicts?: string[];

  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Input for batch read operation
 */
export interface BatchReadInput {
  /** Object ID to read */
  id: string;

  /** Optional ID property name (default: "id") */
  idProperty?: string;
}

/**
 * Input for batch archive operation
 */
export interface BatchArchiveInput {
  /** Object ID to archive */
  id: string;
}

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /** Properties to return in results */
  properties?: string[];

  /** Associations to include */
  associations?: string[];

  /** Whether to process in parallel chunks */
  parallel?: boolean;

  /** Maximum chunk size for processing */
  chunkSize?: number;

  /** Maximum concurrent chunks */
  maxConcurrency?: number;

  /** Whether to stop on first error */
  stopOnError?: boolean;
}

/**
 * Batch create request body
 */
export interface BatchCreateRequest {
  /** Array of objects to create */
  inputs: CreateInput[];
}

/**
 * Batch read request body
 */
export interface BatchReadRequest {
  /** Array of IDs to read */
  inputs: BatchReadInput[];

  /** Properties to return */
  properties?: string[];

  /** Property history fields to include */
  propertiesWithHistory?: string[];

  /** ID property name */
  idProperty?: string;
}

/**
 * Batch update request body
 */
export interface BatchUpdateRequest {
  /** Array of updates to apply */
  inputs: UpdateInput[];
}

/**
 * Batch archive request body
 */
export interface BatchArchiveRequest {
  /** Array of IDs to archive */
  inputs: BatchArchiveInput[];
}

/**
 * Batch upsert input (create or update)
 */
export interface BatchUpsertInput {
  /** Unique identifier property name */
  idProperty: string;

  /** Unique identifier value */
  id?: string;

  /** Properties to set */
  properties: Properties;
}

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
  /** Total items to process */
  total: number;

  /** Items completed */
  completed: number;

  /** Items with errors */
  failed: number;

  /** Items pending */
  pending: number;

  /** Current progress percentage (0-100) */
  percentage: number;

  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;

  /** Processing rate (items per second) */
  rate?: number;
}

/**
 * Batch operation metadata
 */
export interface BatchMetadata {
  /** Batch operation ID */
  batchId?: string;

  /** Object type being processed */
  objectType: ObjectType;

  /** Operation type */
  operation: 'create' | 'read' | 'update' | 'archive' | 'upsert';

  /** Timestamp when batch started */
  startedAt: Date;

  /** Timestamp when batch completed */
  completedAt?: Date;

  /** Duration in milliseconds */
  duration?: number;

  /** Total items in batch */
  totalItems: number;

  /** Successful items */
  successCount: number;

  /** Failed items */
  errorCount: number;
}

/**
 * Chunked batch execution context
 */
export interface ChunkContext {
  /** Current chunk index */
  chunkIndex: number;

  /** Total number of chunks */
  totalChunks: number;

  /** Items in current chunk */
  chunkSize: number;

  /** Cumulative results so far */
  accumulatedResults: CrmObject[];

  /** Cumulative errors so far */
  accumulatedErrors: BatchError[];
}
