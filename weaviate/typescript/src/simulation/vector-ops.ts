/**
 * Vector operations for similarity computation
 *
 * This module provides vector distance and similarity calculation functions
 * used by the mock client to simulate Weaviate's vector search behavior.
 */

import type { Vector, DistanceMetric } from '../types/vector.js';

/**
 * Computes the distance between two vectors using the specified metric
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @param metric - Distance metric to use
 * @returns Distance value (interpretation depends on metric)
 * @throws Error if vectors have different dimensions
 */
export function computeDistance(
  v1: Vector,
  v2: Vector,
  metric: DistanceMetric
): number {
  if (v1.length !== v2.length) {
    throw new Error(
      `Vector dimension mismatch: ${v1.length} vs ${v2.length}`
    );
  }

  switch (metric) {
    case 'cosine':
      return computeCosineDistance(v1, v2);
    case 'dot':
      return -computeDotProduct(v1, v2); // Negate so lower is better
    case 'l2-squared':
      return computeL2Squared(v1, v2);
    case 'manhattan':
      return computeManhattan(v1, v2);
    case 'hamming':
      return computeHamming(v1, v2);
    default:
      throw new Error(`Unsupported distance metric: ${metric}`);
  }
}

/**
 * Computes cosine distance (1 - cosine similarity)
 *
 * Range: 0-2 where 0 is identical, 2 is opposite
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Cosine distance
 */
export function computeCosineDistance(v1: Vector, v2: Vector): number {
  const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
  const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));

  if (mag1 === 0 || mag2 === 0) {
    return 1.0; // Perpendicular
  }

  const cosineSimilarity = dotProduct / (mag1 * mag2);
  return 1.0 - cosineSimilarity;
}

/**
 * Computes dot product (inner product) of two vectors
 *
 * Range: -∞ to +∞ where higher is more similar
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Dot product
 */
export function computeDotProduct(v1: Vector, v2: Vector): number {
  return v1.reduce((sum, val, i) => sum + val * v2[i], 0);
}

/**
 * Computes squared Euclidean distance (L2 squared)
 *
 * Range: 0 to +∞ where 0 is identical
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns L2 squared distance
 */
export function computeL2Squared(v1: Vector, v2: Vector): number {
  return v1.reduce((sum, val, i) => {
    const diff = val - v2[i];
    return sum + diff * diff;
  }, 0);
}

/**
 * Computes Manhattan distance (L1 distance)
 *
 * Range: 0 to +∞ where 0 is identical
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Manhattan distance
 */
export function computeManhattan(v1: Vector, v2: Vector): number {
  return v1.reduce((sum, val, i) => sum + Math.abs(val - v2[i]), 0);
}

/**
 * Computes Hamming distance (number of differing positions)
 *
 * Treats values as binary (threshold at 0.5)
 * Range: 0 to vector.length where 0 is identical
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Hamming distance
 */
export function computeHamming(v1: Vector, v2: Vector): number {
  return v1.reduce((count, val, i) => {
    const bit1 = val > 0.5 ? 1 : 0;
    const bit2 = v2[i] > 0.5 ? 1 : 0;
    return count + (bit1 !== bit2 ? 1 : 0);
  }, 0);
}

/**
 * Computes similarity score from distance
 *
 * Converts distance to a 0-1 similarity score where 1 is most similar.
 * Useful for computing certainty values.
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @param metric - Distance metric
 * @returns Similarity score (0-1)
 */
export function computeSimilarity(
  v1: Vector,
  v2: Vector,
  metric: DistanceMetric
): number {
  const distance = computeDistance(v1, v2, metric);

  switch (metric) {
    case 'cosine':
      // Cosine distance is 0-2, convert to similarity
      return 1.0 - distance / 2.0;
    case 'dot':
      // Dot product was negated, un-negate and normalize
      // This is a rough approximation
      return Math.max(0, Math.min(1, (-distance + 1) / 2));
    case 'l2-squared':
    case 'manhattan':
    case 'hamming':
      // For distance metrics, use exponential decay
      return Math.exp(-distance);
    default:
      return 1.0 - distance;
  }
}

/**
 * Normalizes a vector to unit length (L2 normalization)
 *
 * @param v - Vector to normalize
 * @returns Normalized vector
 */
export function normalizeVector(v: Vector): Vector {
  const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return v;
  }
  return v.map((val) => val / magnitude);
}

/**
 * Computes certainty from distance for a given metric
 *
 * Certainty is a 0-1 score where 1 is most certain/similar.
 * This matches Weaviate's certainty calculation.
 *
 * @param distance - Distance value
 * @param metric - Distance metric used
 * @returns Certainty score (0-1)
 */
export function distanceToCertainty(
  distance: number,
  metric: DistanceMetric
): number {
  switch (metric) {
    case 'cosine':
      // Cosine distance is 0-2, certainty is 1 - distance/2
      return 1.0 - distance / 2.0;
    case 'dot':
      // Dot product: higher is better, was negated for sorting
      return Math.max(0, Math.min(1, (-distance + 1) / 2));
    case 'l2-squared':
    case 'manhattan':
    case 'hamming':
      // For distance metrics, use inverse with decay
      return 1.0 / (1.0 + distance);
    default:
      return 1.0 - Math.min(1, distance);
  }
}
