/**
 * Hybrid search implementation
 *
 * Combines BM25 keyword search with vector similarity search.
 *
 * @module search/hybrid
 */

import type { HybridQuery } from '../types/search.js';
import { FusionType } from '../types/search.js';
import { GetQueryBuilder } from '../graphql/builder.js';

/**
 * Builds a GraphQL query for hybrid search
 *
 * @param className - Class name to search
 * @param query - Hybrid query parameters
 * @returns GraphQL query string
 *
 * @example
 * ```typescript
 * const graphql = buildHybridQuery('Article', {
 *   query: 'machine learning',
 *   alpha: 0.5,
 *   limit: 10,
 *   fusionType: FusionType.RankedFusion
 * });
 * ```
 */
export function buildHybridQuery(className: string, query: HybridQuery): string {
  const builder = new GetQueryBuilder(className);

  // Add hybrid search
  builder.hybrid(query.query, {
    vector: query.vector,
    alpha: query.alpha,
    fusionType: query.fusionType,
  });

  // Add filter if provided
  if (query.filter) {
    builder.where(query.filter);
  }

  // Add pagination
  builder.limit(query.limit);
  if (query.offset !== undefined && query.offset > 0) {
    builder.offset(query.offset);
  }

  // Add tenant if provided
  if (query.tenant) {
    builder.tenant(query.tenant);
  }

  // Add group by if provided
  if (query.groupBy) {
    builder.groupBy(query.groupBy);
  }

  // Determine properties to return
  const properties = query.properties || [];
  builder.properties(properties);

  // Build additional fields
  const additionalFields = ['id', 'score', 'explainScore'];
  if (query.includeVector) {
    additionalFields.push('vector');
  }
  builder.additional(additionalFields);

  return builder.build();
}

/**
 * Determines optimal alpha value for hybrid search
 *
 * Provides a simple heuristic for balancing keyword and vector search.
 * For production use, this should be tuned based on your specific dataset.
 *
 * @param queryText - The query text
 * @returns Recommended alpha value (0.0 = pure BM25, 1.0 = pure vector)
 *
 * @example
 * ```typescript
 * const alpha = determineOptimalAlpha('machine learning tutorial');
 * // Returns 0.5 for balanced search
 * ```
 */
export function determineOptimalAlpha(queryText: string): number {
  // Simple heuristic based on query characteristics
  const words = queryText.trim().split(/\s+/);
  const wordCount = words.length;

  // Very short queries (1-2 words) - favor keyword search
  if (wordCount <= 2) {
    return 0.3; // 70% keyword, 30% vector
  }

  // Medium queries (3-5 words) - balanced
  if (wordCount <= 5) {
    return 0.5; // 50% keyword, 50% vector
  }

  // Long queries (6+ words) - favor semantic search
  return 0.7; // 30% keyword, 70% vector
}

/**
 * Validates hybrid query parameters
 *
 * @param query - Query to validate
 * @throws Error if validation fails
 */
export function validateHybridQuery(query: HybridQuery): void {
  if (!query.className) {
    throw new Error('className is required');
  }

  if (!query.query || typeof query.query !== 'string') {
    throw new Error('query must be a non-empty string');
  }

  if (query.query.trim() === '') {
    throw new Error('query cannot be empty');
  }

  if (typeof query.alpha !== 'number') {
    throw new Error('alpha must be a number');
  }

  if (query.alpha < 0 || query.alpha > 1) {
    throw new Error('alpha must be between 0 and 1');
  }

  if (typeof query.limit !== 'number' || query.limit < 1) {
    throw new Error('limit must be a positive number');
  }

  if (query.limit > 10000) {
    throw new Error('limit cannot exceed 10000');
  }

  if (query.offset !== undefined) {
    if (typeof query.offset !== 'number' || query.offset < 0) {
      throw new Error('offset must be a non-negative number');
    }
  }

  if (query.fusionType !== undefined) {
    const validTypes = Object.values(FusionType);
    if (!validTypes.includes(query.fusionType)) {
      throw new Error(
        `fusionType must be one of: ${validTypes.join(', ')}`
      );
    }
  }

  // Validate custom vector if provided
  if (query.vector) {
    if (!Array.isArray(query.vector)) {
      throw new Error('vector must be an array');
    }
    if (query.vector.length === 0) {
      throw new Error('vector cannot be empty');
    }
    for (let i = 0; i < query.vector.length; i++) {
      if (typeof query.vector[i] !== 'number' || !isFinite(query.vector[i])) {
        throw new Error(`Invalid vector value at index ${i}`);
      }
    }
  }

  // Validate search properties if provided
  if (query.searchProperties) {
    if (!Array.isArray(query.searchProperties)) {
      throw new Error('searchProperties must be an array');
    }
    for (let i = 0; i < query.searchProperties.length; i++) {
      if (typeof query.searchProperties[i] !== 'string') {
        throw new Error(`searchProperties[${i}] must be a string`);
      }
    }
  }
}

/**
 * Calculates the effective fusion weights
 *
 * Helper to understand how alpha translates to actual weights.
 *
 * @param alpha - Alpha parameter (0-1)
 * @returns Object with BM25 and vector weights
 *
 * @example
 * ```typescript
 * const weights = calculateFusionWeights(0.5);
 * // { bm25Weight: 0.5, vectorWeight: 0.5 }
 * ```
 */
export function calculateFusionWeights(alpha: number): {
  bm25Weight: number;
  vectorWeight: number;
} {
  return {
    bm25Weight: 1 - alpha,
    vectorWeight: alpha,
  };
}
