/**
 * Weaviate GraphQL types
 *
 * This module defines the core types for GraphQL queries and responses.
 * Weaviate uses GraphQL for search and aggregation operations.
 */

/**
 * GraphQL query type
 */
export enum QueryType {
  /**
   * Get query - retrieves objects
   */
  Get = 'Get',

  /**
   * Aggregate query - computes statistics
   */
  Aggregate = 'Aggregate',
}

/**
 * GraphQL error location in query
 */
export interface GraphQLErrorLocation {
  /**
   * Line number in the query
   */
  line: number;

  /**
   * Column number in the query
   */
  column: number;
}

/**
 * GraphQL error
 *
 * Represents a single error returned by the GraphQL API.
 */
export interface GraphQLError {
  /**
   * Error message
   */
  message: string;

  /**
   * Path to the field that caused the error
   */
  path?: (string | number)[];

  /**
   * Locations in the query where the error occurred
   */
  locations?: GraphQLErrorLocation[];

  /**
   * Additional error information
   */
  extensions?: Record<string, unknown>;
}

/**
 * GraphQL request
 */
export interface GraphQLRequest {
  /**
   * GraphQL query string
   */
  query: string;

  /**
   * Optional variables for the query
   */
  variables?: Record<string, unknown>;

  /**
   * Optional operation name (if query contains multiple operations)
   */
  operationName?: string;
}

/**
 * GraphQL response
 *
 * Standard GraphQL response format with data and errors.
 */
export interface GraphQLResponse<T = unknown> {
  /**
   * Response data (if successful)
   */
  data?: T;

  /**
   * Array of errors (if any occurred)
   */
  errors?: GraphQLError[];
}

/**
 * GraphQL result wrapper
 *
 * Combines data and errors in a type-safe manner.
 */
export interface GraphQLResult<T> {
  /**
   * Result data
   */
  data: T;

  /**
   * Any errors that occurred
   */
  errors?: GraphQLError[];
}

/**
 * Additional metadata fields that can be requested
 */
export interface AdditionalFields {
  /**
   * Object ID
   */
  id?: boolean;

  /**
   * Vector
   */
  vector?: boolean;

  /**
   * Certainty score (0-1)
   */
  certainty?: boolean;

  /**
   * Distance score
   */
  distance?: boolean;

  /**
   * Hybrid/BM25 score
   */
  score?: boolean;

  /**
   * Score explanation
   */
  explainScore?: boolean;

  /**
   * Creation timestamp
   */
  creationTimeUnix?: boolean;

  /**
   * Last update timestamp
   */
  lastUpdateTimeUnix?: boolean;
}

/**
 * Type guard to check if a response has errors
 */
export function hasGraphQLErrors<T>(
  response: GraphQLResponse<T>
): response is GraphQLResponse<T> & { errors: GraphQLError[] } {
  return Array.isArray(response.errors) && response.errors.length > 0;
}

/**
 * Type guard to check if a response has data
 */
export function hasGraphQLData<T>(
  response: GraphQLResponse<T>
): response is GraphQLResponse<T> & { data: T } {
  return response.data !== undefined && response.data !== null;
}
