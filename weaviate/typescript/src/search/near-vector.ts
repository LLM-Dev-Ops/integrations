/**
 * Near vector search implementation
 *
 * Provides vector similarity search functionality with validation.
 *
 * @module search/near-vector
 */

import type { Vector } from '../types/vector.js';
import type { NearVectorQuery } from '../types/search.js';
import type { VectorValidationResult } from './types.js';
import { GetQueryBuilder } from '../graphql/builder.js';

/**
 * Validates vector dimensions against schema
 *
 * @param vector - Query vector
 * @param schema - Class schema definition
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateVectorDimensions([0.1, 0.2, 0.3], schema);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateVectorDimensions(
  vector: Vector,
  schema: {
    vectorIndexConfig?: {
      distance: string;
    };
  }
): VectorValidationResult {
  if (!Array.isArray(vector)) {
    return {
      valid: false,
      error: 'Vector must be an array',
    };
  }

  if (vector.length === 0) {
    return {
      valid: false,
      actualDimensions: 0,
      error: 'Vector cannot be empty',
    };
  }

  // Check all values are numbers
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !isFinite(vector[i])) {
      return {
        valid: false,
        actualDimensions: vector.length,
        error: `Invalid vector value at index ${i}: ${vector[i]}`,
      };
    }
  }

  // Note: Weaviate doesn't return expected dimensions in schema,
  // so we can't validate exact dimensions here. The server will
  // reject mismatched dimensions.
  return {
    valid: true,
    actualDimensions: vector.length,
  };
}

/**
 * Builds a GraphQL query for near vector search
 *
 * @param className - Class name to search
 * @param query - Near vector query parameters
 * @returns GraphQL query string
 *
 * @example
 * ```typescript
 * const graphql = buildNearVectorQuery('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10,
 *   certainty: 0.7,
 *   properties: ['title', 'content'],
 *   includeVector: true
 * });
 * ```
 */
export function buildNearVectorQuery(
  className: string,
  query: NearVectorQuery
): string {
  const builder = new GetQueryBuilder(className);

  // Add near vector search
  builder.nearVector(query.vector, {
    certainty: query.certainty,
    distance: query.distance,
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

  // Add autocut if provided
  if (query.autocut !== undefined) {
    builder.autocut(query.autocut);
  }

  // Determine properties to return
  const properties = query.properties || [];
  builder.properties(properties);

  // Build additional fields
  const additionalFields = ['id', 'distance', 'certainty'];
  if (query.includeVector) {
    additionalFields.push('vector');
  }
  builder.additional(additionalFields);

  return builder.build();
}

/**
 * Validates near vector query parameters
 *
 * @param query - Query to validate
 * @throws Error if validation fails
 */
export function validateNearVectorQuery(query: NearVectorQuery): void {
  if (!query.className) {
    throw new Error('className is required');
  }

  if (!query.vector) {
    throw new Error('vector is required');
  }

  if (!Array.isArray(query.vector)) {
    throw new Error('vector must be an array');
  }

  if (query.vector.length === 0) {
    throw new Error('vector cannot be empty');
  }

  if (typeof query.limit !== 'number' || query.limit < 1) {
    throw new Error('limit must be a positive number');
  }

  if (query.limit > 10000) {
    throw new Error('limit cannot exceed 10000');
  }

  if (query.certainty !== undefined) {
    if (typeof query.certainty !== 'number') {
      throw new Error('certainty must be a number');
    }
    if (query.certainty < 0 || query.certainty > 1) {
      throw new Error('certainty must be between 0 and 1');
    }
  }

  if (query.distance !== undefined) {
    if (typeof query.distance !== 'number') {
      throw new Error('distance must be a number');
    }
    if (query.distance < 0) {
      throw new Error('distance must be non-negative');
    }
  }

  // Cannot specify both certainty and distance
  if (query.certainty !== undefined && query.distance !== undefined) {
    throw new Error('Cannot specify both certainty and distance');
  }

  if (query.offset !== undefined) {
    if (typeof query.offset !== 'number' || query.offset < 0) {
      throw new Error('offset must be a non-negative number');
    }
  }
}
