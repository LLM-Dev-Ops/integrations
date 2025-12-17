/**
 * HubSpot Search API Types
 * Type definitions for search queries, filters, and results
 */

import type { CrmObject, ObjectType } from './objects.js';

/**
 * Search query structure
 */
export interface SearchQuery {
  /** Filter clauses to apply */
  filters?: FilterClause[];

  /** Filter groups for complex OR conditions */
  filterGroups?: FilterGroup[];

  /** Sort clauses */
  sorts?: SortClause[];

  /** Properties to return in results */
  properties?: string[];

  /** Maximum number of results (max: 100) */
  limit?: number;

  /** Pagination cursor for next page */
  after?: string;

  /** Query string for text search */
  query?: string;
}

/**
 * Filter group containing multiple filters (AND within group, OR between groups)
 */
export interface FilterGroup {
  /** Filters in this group (combined with AND) */
  filters: FilterClause[];
}

/**
 * Individual filter clause
 */
export interface FilterClause {
  /** Property name to filter on */
  propertyName?: string;

  /** Alias for propertyName */
  property?: string;

  /** Filter operator */
  operator: FilterOperator;

  /** Value to compare against */
  value?: string | number | boolean | string[];

  /** High value for BETWEEN operator */
  highValue?: string | number;

  /** Array of values for IN/NOT_IN operators */
  values?: string[];
}

/**
 * Supported filter operators
 */
export type FilterOperator =
  | 'EQ' // Equals
  | 'NEQ' // Not equals
  | 'LT' // Less than
  | 'LTE' // Less than or equal
  | 'GT' // Greater than
  | 'GTE' // Greater than or equal
  | 'BETWEEN' // Between two values
  | 'IN' // In list
  | 'NOT_IN' // Not in list
  | 'HAS_PROPERTY' // Property exists and has any value
  | 'NOT_HAS_PROPERTY' // Property does not exist or is empty
  | 'CONTAINS_TOKEN' // Contains token (word-based)
  | 'NOT_CONTAINS_TOKEN' // Does not contain token
  | 'EQ_ANY_OF' // Equals any of (alias for IN)
  | 'NEQ_ANY_OF'; // Not equals any of (alias for NOT_IN)

/**
 * Sort clause for ordering results
 */
export interface SortClause {
  /** Property name to sort by */
  propertyName?: string;

  /** Alias for propertyName */
  property?: string;

  /** Sort direction (default: ASCENDING) */
  direction?: SortDirection;
}

/**
 * Sort direction
 */
export type SortDirection = 'ASCENDING' | 'DESCENDING';

/**
 * Search result structure
 */
export interface SearchResult<T = CrmObject> {
  /** Total number of matching results */
  total: number;

  /** Results for current page */
  results: T[];

  /** Pagination information */
  paging?: SearchPaging;
}

/**
 * Pagination information for search results
 */
export interface SearchPaging {
  /** Next page cursor */
  next?: SearchPage;

  /** Previous page cursor */
  prev?: SearchPage;
}

/**
 * Page cursor information
 */
export interface SearchPage {
  /** Cursor token for pagination */
  after: string;

  /** Link to fetch this page */
  link?: string;
}

/**
 * Search request body sent to API
 */
export interface SearchRequest {
  /** Filter groups (OR between groups, AND within groups) */
  filterGroups?: FilterGroup[];

  /** Sorts to apply */
  sorts?: SortClause[];

  /** Text query */
  query?: string;

  /** Properties to return */
  properties?: string[];

  /** Maximum results per page */
  limit?: number;

  /** Pagination cursor */
  after?: string;
}

/**
 * Search options for configuring search behavior
 */
export interface SearchOptions {
  /** Include total count in results (may impact performance) */
  includeTotal?: boolean;

  /** Properties to return */
  properties?: string[];

  /** Maximum results per page */
  limit?: number;

  /** Starting cursor for pagination */
  after?: string;

  /** Associations to include */
  associations?: string[];
}

/**
 * Text search query
 */
export interface TextSearchQuery extends SearchQuery {
  /** Search query string (required for text search) */
  query: string;

  /** Minimum search score threshold (0-1) */
  minScore?: number;

  /** Boost factor for specific properties */
  propertyBoosts?: PropertyBoost[];
}

/**
 * Property boost configuration for search ranking
 */
export interface PropertyBoost {
  /** Property to boost */
  property: string;

  /** Boost multiplier (>1 increases relevance) */
  boost: number;
}

/**
 * Aggregation request for search analytics
 */
export interface AggregationRequest {
  /** Type of aggregation */
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

  /** Property to aggregate */
  property: string;
}

/**
 * Aggregation result
 */
export interface AggregationResult {
  /** Aggregation type */
  type: string;

  /** Property aggregated */
  property: string;

  /** Aggregated value */
  value: number;

  /** Bucket counts for grouped aggregations */
  buckets?: AggregationBucket[];
}

/**
 * Aggregation bucket for grouped results
 */
export interface AggregationBucket {
  /** Bucket key/label */
  key: string;

  /** Count of items in bucket */
  count: number;

  /** Aggregated value for bucket */
  value?: number;
}

/**
 * Search iterator state for paginated searches
 */
export interface SearchIteratorState {
  /** Current page cursor */
  cursor?: string;

  /** Total results fetched */
  totalFetched: number;

  /** Whether there are more results */
  hasMore: boolean;

  /** Current page number */
  page: number;
}
