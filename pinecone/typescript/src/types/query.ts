import type { ScoredVector, SparseValues } from './vector.js';
import type { MetadataFilter } from './filter.js';

/**
 * Request to query vectors by similarity
 */
export interface QueryRequest {
  /**
   * Namespace to query within
   */
  namespace?: string;

  /**
   * Query vector values
   */
  vector?: number[];

  /**
   * Sparse vector values for hybrid search
   */
  sparseVector?: SparseValues;

  /**
   * Number of results to return (1-10000)
   */
  topK: number;

  /**
   * Metadata filter to apply
   */
  filter?: MetadataFilter;

  /**
   * Whether to include vector values in results
   */
  includeValues?: boolean;

  /**
   * Whether to include metadata in results
   */
  includeMetadata?: boolean;

  /**
   * ID of a vector to use as the query instead of providing vector values
   */
  id?: string;
}

/**
 * Usage statistics for a query operation
 */
export interface Usage {
  /**
   * Number of read units consumed by the operation
   */
  readUnits?: number;
}

/**
 * Response from a vector similarity query
 */
export interface QueryResponse {
  /**
   * List of most similar vectors with scores
   */
  matches: ScoredVector[];

  /**
   * Namespace that was queried
   */
  namespace?: string;

  /**
   * Usage statistics for the query
   */
  usage?: Usage;
}
