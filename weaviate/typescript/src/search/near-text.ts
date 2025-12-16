/**
 * Near text search implementation
 *
 * Provides semantic text search functionality using vectorizers.
 *
 * @module search/near-text
 */

import type { NearTextQuery } from '../types/search.js';
import type { VectorizerValidationResult } from './types.js';
import { GetQueryBuilder } from '../graphql/builder.js';

/**
 * Validates that the class has a text vectorizer configured
 *
 * @param className - Class name
 * @param schema - Class schema definition
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateVectorizer('Article', schema);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateVectorizer(
  className: string,
  schema: {
    name: string;
    vectorizer: string;
  }
): VectorizerValidationResult {
  if (!schema.vectorizer) {
    return {
      valid: false,
      error: `Class ${className} has no vectorizer configured`,
    };
  }

  if (schema.vectorizer === 'none') {
    return {
      valid: false,
      vectorizer: 'none',
      error: `Class ${className} has vectorizer set to 'none'. Use nearVector instead.`,
    };
  }

  // Check if it's a text vectorizer
  const textVectorizers = [
    'text2vec-',
    'multi2vec-',
    'transformers',
    'contextionary',
  ];

  const isTextVectorizer = textVectorizers.some((prefix) =>
    schema.vectorizer.toLowerCase().includes(prefix)
  );

  if (!isTextVectorizer) {
    return {
      valid: false,
      vectorizer: schema.vectorizer,
      error: `Class ${className} has vectorizer '${schema.vectorizer}' which may not support text search`,
    };
  }

  return {
    valid: true,
    vectorizer: schema.vectorizer,
  };
}

/**
 * Builds a GraphQL query for near text search
 *
 * @param className - Class name to search
 * @param query - Near text query parameters
 * @returns GraphQL query string
 *
 * @example
 * ```typescript
 * const graphql = buildNearTextQuery('Article', {
 *   concepts: ['artificial intelligence', 'machine learning'],
 *   limit: 10,
 *   certainty: 0.7,
 *   properties: ['title', 'content'],
 *   moveTo: {
 *     concepts: ['deep learning'],
 *     force: 0.5
 *   }
 * });
 * ```
 */
export function buildNearTextQuery(
  className: string,
  query: NearTextQuery
): string {
  const builder = new GetQueryBuilder(className);

  // Add near text search
  builder.nearText(query.concepts, {
    certainty: query.certainty,
    distance: query.distance,
    moveTo: query.moveTo,
    moveAway: query.moveAway,
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
 * Validates near text query parameters
 *
 * @param query - Query to validate
 * @throws Error if validation fails
 */
export function validateNearTextQuery(query: NearTextQuery): void {
  if (!query.className) {
    throw new Error('className is required');
  }

  if (!query.concepts || !Array.isArray(query.concepts)) {
    throw new Error('concepts must be a non-empty array');
  }

  if (query.concepts.length === 0) {
    throw new Error('concepts cannot be empty');
  }

  // Check all concepts are strings
  for (let i = 0; i < query.concepts.length; i++) {
    if (typeof query.concepts[i] !== 'string') {
      throw new Error(`concept at index ${i} must be a string`);
    }
    if (query.concepts[i].trim() === '') {
      throw new Error(`concept at index ${i} cannot be empty`);
    }
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

  // Validate moveTo parameters
  if (query.moveTo) {
    validateMoveParams(query.moveTo, 'moveTo');
  }

  // Validate moveAway parameters
  if (query.moveAway) {
    validateMoveParams(query.moveAway, 'moveAway');
  }
}

/**
 * Validates move parameters
 */
function validateMoveParams(
  params: { concepts: string[]; force: number },
  paramName: string
): void {
  if (!params.concepts || !Array.isArray(params.concepts)) {
    throw new Error(`${paramName}.concepts must be an array`);
  }

  if (params.concepts.length === 0) {
    throw new Error(`${paramName}.concepts cannot be empty`);
  }

  for (let i = 0; i < params.concepts.length; i++) {
    if (typeof params.concepts[i] !== 'string') {
      throw new Error(`${paramName}.concepts[${i}] must be a string`);
    }
  }

  if (typeof params.force !== 'number') {
    throw new Error(`${paramName}.force must be a number`);
  }

  if (params.force < 0 || params.force > 1) {
    throw new Error(`${paramName}.force must be between 0 and 1`);
  }
}
