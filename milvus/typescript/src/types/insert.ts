import { FieldData } from './entity.js';

/**
 * Request to insert entities into a collection.
 */
export interface InsertRequest {
  /** Collection name */
  collectionName: string;
  /** Optional partition name */
  partitionName?: string;
  /** Field data for insertion */
  fields: FieldData[];
}

/**
 * Response from an insert operation.
 */
export interface InsertResponse {
  /** Number of entities inserted */
  insertCount: number;
  /** Generated or provided IDs */
  ids: bigint[];
  /** Timestamp of the operation (for session consistency) */
  timestamp: bigint;
}

/**
 * Request to upsert (insert or update) entities.
 */
export interface UpsertRequest {
  /** Collection name */
  collectionName: string;
  /** Optional partition name */
  partitionName?: string;
  /** Field data for upsertion */
  fields: FieldData[];
}

/**
 * Response from an upsert operation.
 */
export interface UpsertResponse {
  /** Number of entities upserted */
  upsertCount: number;
  /** IDs of upserted entities */
  ids: bigint[];
  /** Timestamp of the operation */
  timestamp: bigint;
}

/**
 * Request to delete entities.
 */
export interface DeleteRequest {
  /** Collection name */
  collectionName: string;
  /** Optional partition name */
  partitionName?: string;
  /** Filter expression for deletion */
  filter: string;
}

/**
 * Response from a delete operation.
 */
export interface DeleteResponse {
  /** Number of entities deleted */
  deleteCount: bigint;
  /** Timestamp of the operation */
  timestamp: bigint;
}

/**
 * Options for batch insert operations.
 */
export interface BatchInsertOptions {
  /** Chunk size for batching (default: 10000) */
  chunkSize?: number;
  /** Maximum parallel operations (default: 4) */
  maxParallelism?: number;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Progress information for batch operations.
 */
export interface BatchProgress {
  /** Completed chunks */
  completed: number;
  /** Total chunks */
  total: number;
  /** Total entities inserted so far */
  inserted: number;
}

/**
 * Response from a batch insert operation.
 */
export interface BatchInsertResponse {
  /** Total entities inserted */
  totalInserted: number;
  /** Number of chunks processed */
  chunkCount: number;
  /** Any errors encountered */
  errors: Error[];
}
