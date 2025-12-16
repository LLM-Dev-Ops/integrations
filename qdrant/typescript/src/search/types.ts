/**
 * Type definitions for Qdrant search operations.
 *
 * This module provides comprehensive types for vector similarity search,
 * including search requests, scoring, grouping, and recommendations.
 *
 * @module search/types
 */

/**
 * Point identifier types supported by Qdrant.
 *
 * Qdrant supports both UUID-based and numeric point IDs.
 * UUIDs are stored as strings.
 */
export type PointId = string | number;

/**
 * Vector representation types.
 *
 * Supports multiple vector formats:
 * - Dense vectors: Standard float32 arrays
 * - Sparse vectors: Index-value pairs for high-dimensional sparse data
 * - Named vectors: Multiple named vector spaces in a single point
 */
export type Vector =
  | number[] // Dense vector
  | { indices: number[]; values: number[] } // Sparse vector
  | Record<string, number[]>; // Named vectors

/**
 * Point payload - arbitrary JSON-serializable data attached to a point.
 *
 * Payloads can contain any JSON-serializable data structure including:
 * - Strings, numbers, booleans
 * - Arrays and nested objects
 * - Null values
 */
export type Payload = Record<string, unknown>;

/**
 * Payload selector - controls which payload fields to return.
 *
 * - `true`: Include all payload fields
 * - `false`: Exclude all payload fields
 * - `string[]`: Include only specified fields
 * - `PayloadSelector`: Advanced selector with include/exclude patterns
 */
export type PayloadSelectorType =
  | boolean
  | string[]
  | PayloadSelector;

/**
 * Advanced payload selector with include/exclude patterns.
 */
export interface PayloadSelector {
  /** Fields to include in the response. */
  include?: string[];
  /** Fields to exclude from the response. */
  exclude?: string[];
}

/**
 * Vector selector - controls which vectors to return.
 *
 * - `true`: Include all vectors
 * - `false`: Exclude all vectors
 * - `string[]`: Include only specified named vectors
 */
export type VectorSelectorType = boolean | string[];

/**
 * Search parameters for fine-tuning search behavior.
 *
 * These parameters control the HNSW (Hierarchical Navigable Small World)
 * index behavior during search operations.
 */
export interface SearchParams {
  /**
   * Size of the dynamic candidate list for HNSW search.
   *
   * Higher values improve accuracy at the cost of speed.
   * Typical values: 32-512. Default is determined by collection config.
   */
  hnswEf?: number;

  /**
   * If true, performs exact search by scanning all points.
   *
   * Bypasses HNSW index for guaranteed accuracy.
   * Much slower but provides exact results.
   */
  exact?: boolean;

  /**
   * Quantization oversampling factor.
   *
   * When quantization is enabled, search more candidates before
   * rescoring with full vectors. Default: 1.0 (no oversampling).
   */
  quantizationOversampling?: number;
}

/**
 * Filter condition for restricting search results.
 *
 * Filters use a boolean algebra structure with must/should/must_not clauses.
 */
export interface Filter {
  /** All conditions must match (AND). */
  must?: Condition[];
  /** At least one condition must match (OR). */
  should?: Condition[];
  /** No conditions can match (NOT). */
  mustNot?: Condition[];
  /** Minimum number of 'should' conditions that must match. */
  minShould?: number;
}

/**
 * Individual filter condition.
 *
 * Conditions can match on field values, point IDs, nested structures,
 * or recursively contain other filters.
 */
export type Condition = FieldCondition | HasIdCondition | FilterCondition;

/**
 * Field-based condition matching payload values.
 */
export interface FieldCondition {
  /** The field key in the payload to match against. */
  key: string;
  /** Match exact value(s). */
  match?: MatchValue;
  /** Match numeric range. */
  range?: RangeValue;
  /** Match geographic bounding box. */
  geoBoundingBox?: GeoBoundingBox;
  /** Match geographic radius. */
  geoRadius?: GeoRadius;
  /** Count values in an array field. */
  valuesCount?: ValuesCount;
  /** Check if field is empty or missing. */
  isEmpty?: boolean;
  /** Check if field is null. */
  isNull?: boolean;
}

/**
 * Point ID condition.
 */
export interface HasIdCondition {
  /** List of point IDs to match. */
  hasId: PointId[];
}

/**
 * Nested filter condition.
 */
export interface FilterCondition {
  /** Nested filter to apply. */
  filter: Filter;
}

/**
 * Match value for exact or keyword matching.
 */
export type MatchValue =
  | string
  | number
  | boolean
  | string[]
  | number[];

/**
 * Numeric range for filtering.
 */
export interface RangeValue {
  /** Greater than or equal to. */
  gte?: number;
  /** Less than or equal to. */
  lte?: number;
  /** Greater than. */
  gt?: number;
  /** Less than. */
  lt?: number;
}

/**
 * Geographic bounding box filter.
 */
export interface GeoBoundingBox {
  /** Top-left corner. */
  topLeft: GeoPoint;
  /** Bottom-right corner. */
  bottomRight: GeoPoint;
}

/**
 * Geographic radius filter.
 */
export interface GeoRadius {
  /** Center point. */
  center: GeoPoint;
  /** Radius in meters. */
  radiusMeters: number;
}

/**
 * Geographic point (latitude, longitude).
 */
export interface GeoPoint {
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees. */
  lon: number;
}

/**
 * Values count filter for array fields.
 */
export interface ValuesCount {
  /** Greater than or equal to. */
  gte?: number;
  /** Less than or equal to. */
  lte?: number;
  /** Greater than. */
  gt?: number;
  /** Less than. */
  lt?: number;
}

/**
 * Search request for KNN similarity search.
 *
 * Performs vector similarity search to find the most similar points
 * to a given query vector.
 */
export interface SearchRequest {
  /** Query vector to search with. */
  vector: number[];
  /** Maximum number of results to return. */
  limit: number;
  /** Number of results to skip (for pagination). */
  offset?: number;
  /** Filter to apply before search. */
  filter?: Filter;
  /** Which payload fields to return. */
  withPayload?: PayloadSelectorType;
  /** Which vectors to return. */
  withVectors?: VectorSelectorType;
  /** Minimum similarity score threshold. */
  scoreThreshold?: number;
  /** Search-specific parameters (HNSW tuning). */
  searchParams?: SearchParams;
  /** Name of the vector to search (for multi-vector collections). */
  vectorName?: string;
}

/**
 * Scored point returned from search operations.
 *
 * Contains the point data along with its similarity score.
 */
export interface ScoredPoint {
  /** Point identifier. */
  id: PointId;
  /** Similarity score (higher is more similar). */
  score: number;
  /** Point payload (if requested). */
  payload?: Payload;
  /** Point vector(s) (if requested). */
  vector?: Vector;
  /** Version of the point (for optimistic concurrency). */
  version?: number;
}

/**
 * Search groups request for grouped search results.
 *
 * Performs similarity search but groups results by a payload field,
 * ensuring diverse results across different groups.
 */
export interface SearchGroupsRequest {
  /** Query vector to search with. */
  vector: number[];
  /** Payload field to group by. */
  groupBy: string;
  /** Number of points per group. */
  groupSize: number;
  /** Maximum number of groups to return. */
  limit: number;
  /** Filter to apply before search. */
  filter?: Filter;
  /** Which payload fields to return. */
  withPayload?: PayloadSelectorType;
  /** Which vectors to return. */
  withVectors?: VectorSelectorType;
  /** Minimum similarity score threshold. */
  scoreThreshold?: number;
  /** Search-specific parameters (HNSW tuning). */
  searchParams?: SearchParams;
  /** Name of the vector to search (for multi-vector collections). */
  vectorName?: string;
}

/**
 * Point group from grouped search results.
 *
 * Contains a group identifier and the top-scoring points in that group.
 */
export interface PointGroup {
  /** Group identifier (value of the groupBy field). */
  id: string | number;
  /** Scored points in this group. */
  hits: ScoredPoint[];
}

/**
 * Recommendation request for point-based recommendations.
 *
 * Finds points similar to positive examples and dissimilar to negative examples.
 * Uses the centroid of positive examples (minus negative examples) as the query vector.
 */
export interface RecommendRequest {
  /** Points to recommend similar items to (positive examples). */
  positive: PointId[];
  /** Points to avoid in recommendations (negative examples). */
  negative?: PointId[];
  /** Maximum number of results to return. */
  limit: number;
  /** Filter to apply before search. */
  filter?: Filter;
  /** Which payload fields to return. */
  withPayload?: PayloadSelectorType;
  /** Which vectors to return. */
  withVectors?: VectorSelectorType;
  /** Minimum similarity score threshold. */
  scoreThreshold?: number;
  /** Search-specific parameters (HNSW tuning). */
  searchParams?: SearchParams;
  /** Name of the vector to use (for multi-vector collections). */
  vectorName?: string;
  /**
   * Strategy for combining positive examples.
   * - "average_vector": Use average of positive vectors (default)
   * - "best_score": Search from each positive and merge results
   */
  strategy?: "average_vector" | "best_score";
}

/**
 * Discovery request for context-based discovery.
 *
 * Discovers points in a specific context defined by positive and negative pairs.
 * More advanced than recommend, allows fine-grained context control.
 */
export interface DiscoverRequest {
  /** Target point or vector to discover from. */
  target?: PointId | number[];
  /** Context pairs defining the discovery space. */
  context?: ContextPair[];
  /** Maximum number of results to return. */
  limit: number;
  /** Filter to apply before search. */
  filter?: Filter;
  /** Which payload fields to return. */
  withPayload?: PayloadSelectorType;
  /** Which vectors to return. */
  withVectors?: VectorSelectorType;
  /** Minimum similarity score threshold. */
  scoreThreshold?: number;
  /** Search-specific parameters (HNSW tuning). */
  searchParams?: SearchParams;
  /** Name of the vector to use (for multi-vector collections). */
  vectorName?: string;
}

/**
 * Context pair for discovery operations.
 *
 * Defines a positive-negative example pair that shapes the discovery space.
 */
export interface ContextPair {
  /** Positive example point ID. */
  positive: PointId;
  /** Negative example point ID. */
  negative: PointId;
}
