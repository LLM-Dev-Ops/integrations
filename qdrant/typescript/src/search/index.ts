/**
 * Search operations module for Qdrant vector database.
 *
 * This module provides comprehensive vector similarity search capabilities:
 * - Vector similarity search (KNN)
 * - Batch search for multiple queries
 * - Grouped search for diverse results
 * - Point-based recommendations
 * - Context-based discovery
 *
 * @module search
 */

// Export client
export { SearchClient, SearchRequestBuilder } from './client.js';
export type { HttpClient, SearchClientOptions } from './client.js';

// Export types
export type {
  // Core types
  PointId,
  Vector,
  Payload,

  // Selectors
  PayloadSelectorType,
  PayloadSelector,
  VectorSelectorType,

  // Search configuration
  SearchParams,

  // Filters
  Filter,
  Condition,
  FieldCondition,
  HasIdCondition,
  FilterCondition,
  MatchValue,
  RangeValue,
  GeoBoundingBox,
  GeoRadius,
  GeoPoint,
  ValuesCount,

  // Requests
  SearchRequest,
  SearchGroupsRequest,
  RecommendRequest,
  DiscoverRequest,

  // Responses
  ScoredPoint,
  PointGroup,

  // Context
  ContextPair,
} from './types.js';
