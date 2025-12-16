/**
 * Weaviate vector types
 *
 * This module defines vector-related types including distance metrics
 * and vector representations used in similarity search.
 */

/**
 * Distance metrics supported by Weaviate's vector index
 *
 * Different distance metrics are suitable for different use cases:
 * - **Cosine**: Measures angle between vectors (range: 0-2, lower is more similar)
 * - **DotProduct**: Inner product of vectors (higher is more similar)
 * - **L2Squared**: Euclidean distance squared (lower is more similar)
 * - **Manhattan**: Sum of absolute differences (lower is more similar)
 * - **Hamming**: Number of differing bits for binary vectors (lower is more similar)
 *
 * @see https://weaviate.io/developers/weaviate/config-refs/distances
 */
export enum DistanceMetric {
  /**
   * Cosine distance (1 - cosine similarity)
   * Range: 0-2 where 0 is identical, 2 is opposite
   * Best for: Text embeddings, normalized vectors
   */
  Cosine = 'cosine',

  /**
   * Dot product (inner product)
   * Range: -∞ to +∞ where higher is more similar
   * Best for: When vector magnitude matters
   */
  DotProduct = 'dot',

  /**
   * Squared Euclidean distance (L2 distance squared)
   * Range: 0 to +∞ where 0 is identical
   * Best for: General purpose, efficient computation
   */
  L2Squared = 'l2-squared',

  /**
   * Manhattan distance (L1 distance)
   * Range: 0 to +∞ where 0 is identical
   * Best for: High-dimensional sparse vectors
   */
  Manhattan = 'manhattan',

  /**
   * Hamming distance
   * Range: 0 to vector_length where 0 is identical
   * Best for: Binary vectors, hash-based search
   */
  Hamming = 'hamming',
}

/**
 * Dense vector representation
 *
 * Vectors are arrays of floating-point numbers representing
 * embeddings in a multi-dimensional space.
 */
export type Vector = number[];

/**
 * Vector with associated metadata
 */
export interface VectorWithMetadata {
  /**
   * The vector values
   */
  vector: Vector;

  /**
   * Optional vector name (for named vectors/multi-vector support)
   */
  name?: string;
}

/**
 * Similarity scores returned from vector search
 */
export interface SimilarityScores {
  /**
   * Certainty score (0.0 - 1.0)
   * Higher values indicate greater certainty/similarity
   * Available for: cosine, dot product
   */
  certainty?: number;

  /**
   * Distance score
   * Interpretation depends on distance metric used
   * Lower values typically indicate greater similarity (except dot product)
   */
  distance?: number;

  /**
   * Raw score from the search algorithm
   */
  score?: number;
}

/**
 * Product Quantization (PQ) configuration for vector compression
 *
 * PQ reduces memory usage by compressing vectors while maintaining
 * reasonable search quality.
 */
export interface PQConfig {
  /**
   * Whether PQ is enabled
   */
  enabled: boolean;

  /**
   * Training limit - number of vectors to use for training
   */
  trainingLimit?: number;

  /**
   * Number of segments to divide vector into
   */
  segments?: number;

  /**
   * Number of centroids per segment
   */
  centroids?: number;

  /**
   * Encoder configuration
   */
  encoder?: {
    /**
     * Encoder type (e.g., 'kmeans', 'tile')
     */
    type: string;

    /**
     * Distribution type (e.g., 'log-normal', 'normal')
     */
    distribution?: string;
  };
}

/**
 * Validates that a vector has the expected dimensions
 *
 * @param vector - The vector to validate
 * @param expectedDimensions - Expected number of dimensions
 * @returns True if vector has correct dimensions
 */
export function isValidVectorDimensions(
  vector: Vector,
  expectedDimensions: number
): boolean {
  return Array.isArray(vector) && vector.length === expectedDimensions;
}

/**
 * Validates that all values in a vector are finite numbers
 *
 * @param vector - The vector to validate
 * @returns True if all values are valid numbers
 */
export function isValidVectorValues(vector: Vector): boolean {
  return vector.every((value) => typeof value === 'number' && isFinite(value));
}

/**
 * Validates a complete vector
 *
 * @param vector - The vector to validate
 * @param expectedDimensions - Expected number of dimensions (optional)
 * @returns True if vector is valid
 */
export function isValidVector(
  vector: Vector,
  expectedDimensions?: number
): boolean {
  if (!Array.isArray(vector) || vector.length === 0) {
    return false;
  }

  if (expectedDimensions !== undefined) {
    if (!isValidVectorDimensions(vector, expectedDimensions)) {
      return false;
    }
  }

  return isValidVectorValues(vector);
}

/**
 * Normalizes a vector to unit length (L2 normalization)
 *
 * @param vector - The vector to normalize
 * @returns Normalized vector
 */
export function normalizeVector(vector: Vector): Vector {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((val) => val / magnitude);
}
