/**
 * Weaviate search types
 *
 * This module defines types for various search operations including
 * vector similarity search, hybrid search, and BM25 keyword search.
 */

import type { UUID, Properties } from './property.js';
import type { Vector, SimilarityScores } from './vector.js';
import type { WhereFilter } from './filter.js';

/**
 * Fusion type for hybrid search
 *
 * Determines how BM25 and vector search results are combined.
 */
export enum FusionType {
  /**
   * Ranked fusion - combines based on rank positions
   * Good for balanced retrieval
   */
  RankedFusion = 'rankedFusion',

  /**
   * Relative score fusion - normalizes scores before combining
   * Better when score magnitudes vary
   */
  RelativeScoreFusion = 'relativeScoreFusion',
}

/**
 * Move parameters for nearText queries
 *
 * Allows moving the search vector towards or away from concepts.
 */
export interface MoveParams {
  /**
   * Concepts to move towards/away from
   */
  concepts: string[];

  /**
   * Force of the move (0.0 - 1.0)
   * Higher values mean stronger influence
   */
  force: number;

  /**
   * Optional objects to move towards/away from
   */
  objects?: Array<{
    id: UUID;
    className?: string;
  }>;
}

/**
 * Near vector query - search by vector similarity
 *
 * @example
 * ```typescript
 * const query: NearVectorQuery = {
 *   className: "Article",
 *   vector: [0.1, 0.2, 0.3, ...],
 *   limit: 10,
 *   certainty: 0.7,
 *   properties: ["title", "content"],
 *   includeVector: true
 * };
 * ```
 */
export interface NearVectorQuery {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * Query vector
   */
  vector: Vector;

  /**
   * Minimum certainty threshold (0.0 - 1.0)
   * Objects with lower certainty are excluded
   */
  certainty?: number;

  /**
   * Maximum distance threshold
   * Objects with greater distance are excluded
   * Note: Use certainty OR distance, not both
   */
  distance?: number;

  /**
   * Maximum number of results to return
   */
  limit: number;

  /**
   * Number of results to skip
   */
  offset?: number;

  /**
   * Metadata filter to apply
   */
  filter?: WhereFilter;

  /**
   * Properties to return in results
   * Returns all properties if not specified
   */
  properties?: string[];

  /**
   * Whether to include vectors in results
   */
  includeVector?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Group by configuration for result grouping
   */
  groupBy?: GroupByConfig;

  /**
   * Autocutoff configuration for adaptive result limiting
   */
  autocut?: number;
}

/**
 * Near object query - search by similarity to another object
 *
 * @example
 * ```typescript
 * const query: NearObjectQuery = {
 *   className: "Article",
 *   id: "123e4567-e89b-12d3-a456-426614174000" as UUID,
 *   limit: 10,
 *   properties: ["title", "content"]
 * };
 * ```
 */
export interface NearObjectQuery {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * ID of the object to find similar items to
   */
  id: UUID;

  /**
   * Minimum certainty threshold (0.0 - 1.0)
   */
  certainty?: number;

  /**
   * Maximum distance threshold
   */
  distance?: number;

  /**
   * Maximum number of results to return
   */
  limit: number;

  /**
   * Number of results to skip
   */
  offset?: number;

  /**
   * Metadata filter to apply
   */
  filter?: WhereFilter;

  /**
   * Properties to return in results
   */
  properties?: string[];

  /**
   * Whether to include vectors in results
   */
  includeVector?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Group by configuration
   */
  groupBy?: GroupByConfig;
}

/**
 * Near text query - semantic search via vectorizer
 *
 * @example
 * ```typescript
 * const query: NearTextQuery = {
 *   className: "Article",
 *   concepts: ["artificial intelligence", "machine learning"],
 *   limit: 10,
 *   certainty: 0.7,
 *   moveTo: {
 *     concepts: ["deep learning"],
 *     force: 0.5
 *   }
 * };
 * ```
 */
export interface NearTextQuery {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * Concepts to search for
   * The vectorizer will convert these to vectors
   */
  concepts: string[];

  /**
   * Minimum certainty threshold (0.0 - 1.0)
   */
  certainty?: number;

  /**
   * Maximum distance threshold
   */
  distance?: number;

  /**
   * Move the search vector towards these concepts
   */
  moveTo?: MoveParams;

  /**
   * Move the search vector away from these concepts
   */
  moveAway?: MoveParams;

  /**
   * Maximum number of results to return
   */
  limit: number;

  /**
   * Number of results to skip
   */
  offset?: number;

  /**
   * Metadata filter to apply
   */
  filter?: WhereFilter;

  /**
   * Properties to return in results
   */
  properties?: string[];

  /**
   * Whether to include vectors in results
   */
  includeVector?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Group by configuration
   */
  groupBy?: GroupByConfig;

  /**
   * Autocutoff configuration
   */
  autocut?: number;
}

/**
 * Hybrid query - combined BM25 and vector search
 *
 * @example
 * ```typescript
 * const query: HybridQuery = {
 *   className: "Article",
 *   query: "machine learning",
 *   alpha: 0.5, // 50% vector, 50% BM25
 *   limit: 10,
 *   fusionType: FusionType.RankedFusion
 * };
 * ```
 */
export interface HybridQuery {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * Search query text
   */
  query: string;

  /**
   * Optional query vector (if not using vectorizer)
   */
  vector?: Vector;

  /**
   * Balance between vector (1.0) and BM25 (0.0)
   * - 0.0 = pure BM25 (keyword)
   * - 0.5 = equal weight (recommended default)
   * - 1.0 = pure vector search
   */
  alpha: number;

  /**
   * Fusion algorithm to combine results
   */
  fusionType?: FusionType;

  /**
   * Maximum number of results to return
   */
  limit: number;

  /**
   * Number of results to skip
   */
  offset?: number;

  /**
   * Metadata filter to apply
   */
  filter?: WhereFilter;

  /**
   * Properties to return in results
   */
  properties?: string[];

  /**
   * Whether to include vectors in results
   */
  includeVector?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Properties to search in (for BM25 part)
   */
  searchProperties?: string[];

  /**
   * Group by configuration
   */
  groupBy?: GroupByConfig;
}

/**
 * BM25 query - keyword-based search
 *
 * @example
 * ```typescript
 * const query: BM25Query = {
 *   className: "Article",
 *   query: "machine learning",
 *   properties: ["title", "content"],
 *   limit: 10
 * };
 * ```
 */
export interface BM25Query {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * Search query text
   */
  query: string;

  /**
   * Properties to search in
   * Searches all text properties if not specified
   */
  properties?: string[];

  /**
   * Maximum number of results to return
   */
  limit: number;

  /**
   * Number of results to skip
   */
  offset?: number;

  /**
   * Metadata filter to apply
   */
  filter?: WhereFilter;

  /**
   * Properties to return in results
   */
  returnProperties?: string[];

  /**
   * Whether to include vectors in results
   */
  includeVector?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Group by configuration
   */
  groupBy?: GroupByConfig;
}

/**
 * Group by configuration for search results
 */
export interface GroupByConfig {
  /**
   * Property to group by
   */
  path: string[];

  /**
   * Number of groups to return
   */
  groups: number;

  /**
   * Objects per group
   */
  objectsPerGroup: number;
}

/**
 * Search hit - a single result from a search query
 *
 * Contains the object data along with relevance scores.
 */
export interface SearchHit {
  /**
   * Object UUID
   */
  id: UUID;

  /**
   * Class name
   */
  className: string;

  /**
   * Object properties
   */
  properties: Properties;

  /**
   * Vector (if requested)
   */
  vector?: Vector;

  /**
   * BM25 or hybrid score (higher is more relevant)
   */
  score?: number;

  /**
   * Vector similarity certainty (0.0 - 1.0)
   */
  certainty?: number;

  /**
   * Vector distance (lower is more similar)
   */
  distance?: number;

  /**
   * Explanation of the score (if requested)
   */
  explainScore?: string;

  /**
   * Additional metadata
   */
  additional?: Record<string, unknown>;
}

/**
 * Search result - response from a search query
 */
export interface SearchResult {
  /**
   * Array of search hits
   */
  objects: SearchHit[];

  /**
   * Total count of matching objects (if available)
   */
  totalCount?: number;

  /**
   * Groups (if groupBy was used)
   */
  groups?: SearchGroup[];
}

/**
 * Search group - grouped search results
 */
export interface SearchGroup {
  /**
   * Group identifier value
   */
  groupedBy: {
    /**
     * Property path that was grouped by
     */
    path: string[];

    /**
     * Value for this group
     */
    value: unknown;
  };

  /**
   * Hits in this group
   */
  hits: SearchHit[];

  /**
   * Maximum distance in this group
   */
  maxDistance?: number;

  /**
   * Minimum distance in this group
   */
  minDistance?: number;

  /**
   * Number of objects in this group
   */
  numberOfObjects: number;
}

/**
 * Ask query - question answering search
 */
export interface AskQuery {
  /**
   * Name of the class to search
   */
  className: string;

  /**
   * Question to ask
   */
  question: string;

  /**
   * Properties to extract answer from
   */
  properties?: string[];

  /**
   * Minimum certainty threshold
   */
  certainty?: number;

  /**
   * Maximum number of results
   */
  limit?: number;

  /**
   * Metadata filter
   */
  filter?: WhereFilter;

  /**
   * Tenant name
   */
  tenant?: string;
}

/**
 * Ask result - answer from question-answering search
 */
export interface AskResult extends SearchHit {
  /**
   * Generated answer
   */
  answer?: string;

  /**
   * Property the answer was extracted from
   */
  answerProperty?: string;

  /**
   * Start position of answer in text
   */
  startPosition?: number;

  /**
   * End position of answer in text
   */
  endPosition?: number;

  /**
   * Certainty of the answer
   */
  answerCertainty?: number;
}
