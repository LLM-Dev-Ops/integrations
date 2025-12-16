/**
 * Batch-specific types and interfaces
 *
 * Additional types for batch operation configuration and progress tracking.
 * Core batch types are defined in ../types/batch.ts
 */

import type {
  BatchObject,
  BatchResponse,
  BatchDeleteResponse,
  BatchError,
} from '../types/batch.js';

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /**
   * Maximum number of objects per batch chunk
   * Default: 100
   */
  batchSize?: number;

  /**
   * Maximum number of concurrent batch requests
   * Default: 4
   */
  maxParallelism?: number;

  /**
   * Whether to continue processing remaining batches if one fails
   * Default: false
   */
  continueOnError?: boolean;

  /**
   * Optional callback for progress updates
   */
  onProgress?: (progress: BatchProgress) => void;

  /**
   * Consistency level for batch operations
   */
  consistencyLevel?: string;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;
}

/**
 * Batch retry options with exponential backoff
 */
export interface BatchRetryOptions extends BatchOptions {
  /**
   * Maximum number of retry attempts for failed objects
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before first retry
   * Default: 1000
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds between retries
   * Default: 30000 (30 seconds)
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier for exponential backoff
   * Default: 2
   */
  backoffMultiplier?: number;

  /**
   * Whether to add jitter to retry delays
   * Default: true
   */
  jitter?: boolean;
}

/**
 * Delete options for batch delete operations
 */
export interface BatchDeleteOptions {
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
  consistencyLevel?: string;

  /**
   * Output level for response
   * Default: 'minimal'
   */
  output?: 'minimal' | 'verbose';
}

/**
 * Progress tracking for batch operations
 */
export interface BatchProgress {
  /**
   * Total number of objects to process
   */
  total: number;

  /**
   * Number of objects completed
   */
  completed: number;

  /**
   * Number of objects that succeeded
   */
  successful: number;

  /**
   * Number of objects that failed
   */
  failed: number;

  /**
   * Number of objects currently being processed
   */
  inProgress: number;

  /**
   * Current batch/chunk being processed
   */
  currentChunk?: number;

  /**
   * Total number of chunks
   */
  totalChunks?: number;
}

/**
 * Result of batch operation with retry support
 */
export interface BatchResult {
  /**
   * Total number of objects processed
   */
  total: number;

  /**
   * Number of successfully processed objects
   */
  successful: number;

  /**
   * Number of failed objects
   */
  failed: number;

  /**
   * Number of retry attempts made
   */
  attempts: number;

  /**
   * Errors for objects that failed all retry attempts
   */
  errors: BatchError[];

  /**
   * Elapsed time in milliseconds
   */
  elapsedMs: number;
}

/**
 * Represents a chunk of batch objects
 */
export interface BatchChunk {
  /**
   * Chunk index
   */
  index: number;

  /**
   * Objects in this chunk
   */
  objects: BatchObject[];

  /**
   * Estimated size in bytes
   */
  estimatedSize?: number;
}

/**
 * Update object for batch updates
 */
export interface BatchUpdateObject {
  /**
   * Class name
   */
  className: string;

  /**
   * Object UUID
   */
  id: string;

  /**
   * Properties to update
   */
  properties?: Record<string, unknown>;

  /**
   * Vector to update
   */
  vector?: number[];

  /**
   * Whether to merge with existing properties
   */
  merge?: boolean;

  /**
   * Tenant name
   */
  tenant?: string;
}
