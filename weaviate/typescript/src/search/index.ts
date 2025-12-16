/**
 * Search module for Weaviate
 *
 * This module provides comprehensive search capabilities including:
 * - Vector similarity search (nearVector)
 * - Text semantic search (nearText)
 * - Object similarity search (nearObject)
 * - Hybrid search (combining BM25 and vector)
 * - BM25 keyword search
 * - Paginated search iteration
 * - Result filtering and sorting utilities
 *
 * @example
 * ```typescript
 * import {
 *   SearchService,
 *   createSearchIterator,
 *   filterByCertainty,
 *   sortByScore
 * } from './search/index.js';
 *
 * // Create service
 * const searchService = new SearchService({
 *   graphqlExecutor,
 *   observability,
 *   schemaCache,
 *   resilience
 * });
 *
 * // Vector search
 * const results = await searchService.nearVector('Article', {
 *   vector: [0.1, 0.2, 0.3],
 *   limit: 10,
 *   certainty: 0.7
 * });
 *
 * // Filter and sort results
 * const filtered = filterByCertainty(results.objects, 0.8);
 * const sorted = sortByScore(filtered);
 *
 * // Paginated search
 * const iterator = createSearchIterator(
 *   searchService,
 *   'Article',
 *   { vector: [0.1, 0.2, 0.3], limit: 100 },
 *   { pageSize: 20 }
 * );
 *
 * for await (const hits of iterator) {
 *   console.log(`Fetched ${hits.length} results`);
 * }
 * ```
 *
 * @module search
 */

// Main service
export { SearchService, createSearchService } from './service.js';

// Types
export type {
  SearchServiceConfig,
  SearchIteratorConfig,
  VectorValidationResult,
  VectorizerValidationResult,
  // Re-export search types
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
  SearchHit,
  SearchGroup,
  MoveParams,
  GroupByConfig,
  AskQuery,
  AskResult,
  Vector,
  WhereFilter,
  UUID,
} from './types.js';

export { FusionType } from './types.js';

// Near vector search
export {
  validateVectorDimensions,
  buildNearVectorQuery,
  validateNearVectorQuery,
} from './near-vector.js';

// Near text search
export {
  validateVectorizer,
  buildNearTextQuery,
  validateNearTextQuery,
} from './near-text.js';

// Hybrid search
export {
  buildHybridQuery,
  validateHybridQuery,
  determineOptimalAlpha,
  calculateFusionWeights,
} from './hybrid.js';

// Result handling
export {
  parseSearchResultSafe,
  parseSearchHitSafe,
  filterProperties,
  extractProperty,
  sortByProperty,
  sortByScore,
  sortByDistance,
  filterByCertainty,
  filterByDistance,
  filterByScore,
  deduplicateHits,
  mergeSearchResults,
  paginateHits,
} from './result.js';

// Iterator
export {
  SearchIterator,
  createSearchIterator,
  fetchAllResults,
} from './iterator.js';
