/**
 * GraphQL search clause builders
 *
 * Functions to build various search clauses (nearVector, nearText, hybrid, etc.)
 * for GraphQL queries.
 */

import type { Vector } from '../types/vector.js';
import type { MoveParams, FusionType } from '../types/search.js';
import type { UUID } from '../types/property.js';

/**
 * Builds a nearVector clause for vector similarity search
 *
 * @param vector - Query vector
 * @param certainty - Minimum certainty threshold (0-1)
 * @param distance - Maximum distance threshold
 * @returns GraphQL nearVector clause
 *
 * @example
 * ```typescript
 * const clause = buildNearVectorClause([0.1, 0.2, 0.3], 0.7);
 * // Returns: "nearVector: { vector: [0.1, 0.2, 0.3], certainty: 0.7 }"
 * ```
 */
export function buildNearVectorClause(
  vector: Vector,
  certainty?: number,
  distance?: number
): string {
  const vectorStr = vector.join(', ');
  let clause = `nearVector: { vector: [${vectorStr}]`;

  if (certainty !== undefined) {
    clause += `, certainty: ${certainty}`;
  }

  if (distance !== undefined) {
    clause += `, distance: ${distance}`;
  }

  clause += ' }';
  return clause;
}

/**
 * Builds a nearText clause for semantic text search
 *
 * @param concepts - Text concepts to search for
 * @param certainty - Minimum certainty threshold
 * @param distance - Maximum distance threshold
 * @param moveTo - Move search vector towards these concepts
 * @param moveAway - Move search vector away from these concepts
 * @returns GraphQL nearText clause
 *
 * @example
 * ```typescript
 * const clause = buildNearTextClause(
 *   ['artificial intelligence', 'machine learning'],
 *   0.7,
 *   undefined,
 *   { concepts: ['deep learning'], force: 0.5 }
 * );
 * ```
 */
export function buildNearTextClause(
  concepts: string[],
  certainty?: number,
  distance?: number,
  moveTo?: MoveParams,
  moveAway?: MoveParams
): string {
  const conceptsStr = concepts.map((c) => `"${escapeString(c)}"`).join(', ');
  let clause = `nearText: { concepts: [${conceptsStr}]`;

  if (certainty !== undefined) {
    clause += `, certainty: ${certainty}`;
  }

  if (distance !== undefined) {
    clause += `, distance: ${distance}`;
  }

  if (moveTo) {
    clause += `, moveTo: ${serializeMoveParams(moveTo)}`;
  }

  if (moveAway) {
    clause += `, moveAwayFrom: ${serializeMoveParams(moveAway)}`;
  }

  clause += ' }';
  return clause;
}

/**
 * Builds a nearObject clause for object-to-object similarity search
 *
 * @param id - UUID of the reference object
 * @param className - Class name of the reference object
 * @param certainty - Minimum certainty threshold
 * @param distance - Maximum distance threshold
 * @returns GraphQL nearObject clause
 *
 * @example
 * ```typescript
 * const clause = buildNearObjectClause(
 *   '123e4567-e89b-12d3-a456-426614174000' as UUID,
 *   'Article',
 *   0.8
 * );
 * ```
 */
export function buildNearObjectClause(
  id: UUID,
  className: string,
  certainty?: number,
  distance?: number
): string {
  // Build beacon
  const beacon = `weaviate://localhost/${className}/${id}`;
  let clause = `nearObject: { beacon: "${beacon}"`;

  if (certainty !== undefined) {
    clause += `, certainty: ${certainty}`;
  }

  if (distance !== undefined) {
    clause += `, distance: ${distance}`;
  }

  clause += ' }';
  return clause;
}

/**
 * Builds a hybrid clause for combined keyword and vector search
 *
 * @param query - Text query
 * @param vector - Optional query vector
 * @param alpha - Balance between vector (1.0) and keyword (0.0) search
 * @param fusionType - Fusion algorithm to combine results
 * @returns GraphQL hybrid clause
 *
 * @example
 * ```typescript
 * const clause = buildHybridClause(
 *   'machine learning',
 *   undefined,
 *   0.5,
 *   FusionType.RankedFusion
 * );
 * // Returns: hybrid: { query: "machine learning", alpha: 0.5, fusionType: rankedFusion }
 * ```
 */
export function buildHybridClause(
  query: string,
  vector?: Vector,
  alpha?: number,
  fusionType?: FusionType
): string {
  let clause = `hybrid: { query: "${escapeString(query)}"`;

  if (alpha !== undefined) {
    clause += `, alpha: ${alpha}`;
  }

  if (vector) {
    const vectorStr = vector.join(', ');
    clause += `, vector: [${vectorStr}]`;
  }

  if (fusionType) {
    clause += `, fusionType: ${fusionType}`;
  }

  clause += ' }';
  return clause;
}

/**
 * Builds a bm25 clause for keyword search
 *
 * @param query - Text query
 * @param properties - Properties to search (optional)
 * @returns GraphQL bm25 clause
 *
 * @example
 * ```typescript
 * const clause = buildBm25Clause('machine learning', ['title', 'content']);
 * // Returns: bm25: { query: "machine learning", properties: ["title", "content"] }
 * ```
 */
export function buildBm25Clause(query: string, properties?: string[]): string {
  let clause = `bm25: { query: "${escapeString(query)}"`;

  if (properties && properties.length > 0) {
    const propsStr = properties.map((p) => `"${p}"`).join(', ');
    clause += `, properties: [${propsStr}]`;
  }

  clause += ' }';
  return clause;
}

/**
 * Serializes move parameters for nearText
 */
function serializeMoveParams(params: MoveParams): string {
  const conceptsStr = params.concepts
    .map((c) => `"${escapeString(c)}"`)
    .join(', ');
  let result = `{ concepts: [${conceptsStr}], force: ${params.force}`;

  if (params.objects && params.objects.length > 0) {
    const objectsStr = params.objects
      .map((obj) => {
        const beacon = obj.className
          ? `weaviate://localhost/${obj.className}/${obj.id}`
          : `weaviate://localhost/${obj.id}`;
        return `{ beacon: "${beacon}" }`;
      })
      .join(', ');
    result += `, objects: [${objectsStr}]`;
  }

  result += ' }';
  return result;
}

/**
 * Escapes special characters in strings for GraphQL
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Builds a group by clause
 *
 * @param path - Property path to group by
 * @param groups - Number of groups
 * @param objectsPerGroup - Objects per group
 * @returns GraphQL groupBy clause
 */
export function buildGroupByClause(
  path: string[],
  groups: number,
  objectsPerGroup: number
): string {
  const pathStr = path.map((p) => `"${p}"`).join(', ');
  return `groupBy: { path: [${pathStr}], groups: ${groups}, objectsPerGroup: ${objectsPerGroup} }`;
}

/**
 * Builds an autocut clause
 *
 * @param autocut - Autocut value
 * @returns GraphQL autocut clause
 */
export function buildAutocutClause(autocut: number): string {
  return `autocut: ${autocut}`;
}
