/**
 * Point Operations Types for Qdrant
 *
 * Type definitions for point operations including upsert, get, delete, and scroll.
 */

/**
 * Point identifier - can be either a string UUID or a numeric ID
 */
export type PointId = string | number;

/**
 * Sparse vector representation with indices and values
 * Used for hybrid search combining dense and sparse embeddings
 */
export interface SparseVector {
  /**
   * Indices of non-zero values in the sparse vector
   */
  indices: number[];

  /**
   * Values at the corresponding indices
   */
  values: number[];
}

/**
 * Vector data - can be a dense vector, sparse vector, or named vectors
 */
export type Vector = number[] | SparseVector | Record<string, number[]>;

/**
 * Payload data attached to a point
 * Can contain any JSON-serializable data
 */
export type Payload = Record<string, unknown>;

/**
 * A point in the vector space with associated payload
 */
export interface Point {
  /**
   * Unique identifier for the point
   */
  id: PointId;

  /**
   * Vector data (dense, sparse, or named vectors)
   */
  vector: Vector;

  /**
   * Optional payload metadata
   */
  payload?: Payload;
}

/**
 * Result of an upsert operation
 */
export interface UpsertResult {
  /**
   * Operation identifier for tracking
   */
  operationId: number;

  /**
   * Status of the operation
   */
  status: string;
}

/**
 * Result of a batch upsert operation
 */
export interface BatchUpsertResult {
  /**
   * Total number of points processed across all batches
   */
  totalPoints: number;

  /**
   * Number of batches successfully processed
   */
  batchesProcessed: number;

  /**
   * Individual results for each batch
   */
  results: UpsertResult[];

  /**
   * Any errors that occurred during batch processing
   */
  errors?: BatchError[];
}

/**
 * Error that occurred during batch processing
 */
export interface BatchError {
  /**
   * Index of the batch that failed
   */
  batchIndex: number;

  /**
   * Error message
   */
  message: string;

  /**
   * Number of points in the failed batch
   */
  pointCount: number;
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  /**
   * Operation identifier for tracking
   */
  operationId: number;

  /**
   * Status of the operation
   */
  status: string;
}

/**
 * Filter for querying points
 * Supports complex filtering with must, should, and must_not conditions
 */
export interface Filter {
  /**
   * All conditions must match (AND logic)
   */
  must?: FilterCondition[];

  /**
   * At least one condition must match (OR logic)
   */
  should?: FilterCondition[];

  /**
   * None of the conditions must match (NOT logic)
   */
  must_not?: FilterCondition[];
}

/**
 * Individual filter condition
 */
export interface FilterCondition {
  /**
   * Key to filter on (field name in payload)
   */
  key: string;

  /**
   * Match condition with value
   */
  match?: {
    value: unknown;
  };

  /**
   * Range condition for numeric values
   */
  range?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };

  /**
   * Geo-radius condition for location-based filtering
   */
  geo_radius?: {
    center: {
      lon: number;
      lat: number;
    };
    radius: number;
  };

  /**
   * Geo-bounding box condition
   */
  geo_bounding_box?: {
    top_left: {
      lon: number;
      lat: number;
    };
    bottom_right: {
      lon: number;
      lat: number;
    };
  };

  /**
   * Values set condition (matches any value in the set)
   */
  values_count?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
}

/**
 * Options for scrolling through points
 */
export interface ScrollOptions {
  /**
   * Optional filter to apply
   */
  filter?: Filter;

  /**
   * Maximum number of points to return
   */
  limit?: number;

  /**
   * Offset point ID to start from (for pagination)
   */
  offset?: PointId;

  /**
   * Whether to include payload in results
   * @default true
   */
  withPayload?: boolean;

  /**
   * Whether to include vectors in results
   * @default false
   */
  withVectors?: boolean;

  /**
   * Order by payload field
   */
  orderBy?: {
    key: string;
    direction?: 'asc' | 'desc';
  };
}

/**
 * Result of a scroll operation
 */
export interface ScrollResult {
  /**
   * Points matching the scroll criteria
   */
  points: Point[];

  /**
   * Next offset for pagination (if there are more results)
   */
  nextOffset?: PointId;
}

/**
 * Options for batch processing
 */
export interface BatchOptions {
  /**
   * Number of points per batch
   * @default 100
   */
  batchSize?: number;

  /**
   * Maximum number of concurrent batches
   * @default 5
   */
  maxConcurrency?: number;

  /**
   * Callback for progress updates
   */
  onProgress?: (processed: number, total: number) => void;

  /**
   * Callback for batch completion
   */
  onBatchComplete?: (batchIndex: number, result: UpsertResult) => void;

  /**
   * Callback for batch errors
   */
  onBatchError?: (batchIndex: number, error: Error) => void;
}

/**
 * Type guard to check if a vector is a sparse vector
 */
export function isSparseVector(vector: Vector): vector is SparseVector {
  return (
    typeof vector === 'object' &&
    'indices' in vector &&
    'values' in vector &&
    Array.isArray(vector.indices) &&
    Array.isArray(vector.values)
  );
}

/**
 * Type guard to check if a vector is a named vector
 */
export function isNamedVector(vector: Vector): vector is Record<string, number[]> {
  if (Array.isArray(vector) || isSparseVector(vector)) {
    return false;
  }
  return typeof vector === 'object' && Object.values(vector).every(Array.isArray);
}

/**
 * Type guard to check if a vector is a dense vector
 */
export function isDenseVector(vector: Vector): vector is number[] {
  return Array.isArray(vector);
}
