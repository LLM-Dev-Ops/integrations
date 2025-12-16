import type { Metadata } from './metadata.js';

/**
 * Sparse vector values for hybrid search
 *
 * Sparse vectors are represented by their non-zero indices and corresponding values.
 * This is useful for hybrid search combining dense and sparse embeddings.
 */
export interface SparseValues {
  /**
   * The indices of the sparse vector
   */
  indices: number[];

  /**
   * The values at the corresponding indices
   */
  values: number[];
}

/**
 * A vector with its associated metadata
 */
export interface Vector {
  /**
   * Unique identifier for the vector
   */
  id: string;

  /**
   * Dense vector values
   */
  values: number[];

  /**
   * Sparse vector values for hybrid search
   */
  sparseValues?: SparseValues;

  /**
   * Metadata associated with the vector
   */
  metadata?: Metadata;
}

/**
 * A vector with a similarity score from a query
 */
export interface ScoredVector extends Vector {
  /**
   * Similarity score (0-1, where 1 is most similar)
   */
  score: number;
}
