/**
 * GraphQL module for Weaviate
 *
 * This module provides a complete GraphQL query interface for Weaviate,
 * including query builders, executors, parsers, and error handling.
 *
 * @example
 * ```typescript
 * import {
 *   GetQueryBuilder,
 *   GraphQLExecutor,
 *   parseGraphQLResponse
 * } from './graphql/index.js';
 *
 * // Build a query
 * const query = new GetQueryBuilder('Article')
 *   .nearVector([0.1, 0.2, 0.3], { certainty: 0.7 })
 *   .limit(10)
 *   .properties(['title', 'content'])
 *   .additional(['id', 'distance'])
 *   .build();
 *
 * // Execute the query
 * const executor = new GraphQLExecutor({ transport: httpClient });
 * const data = await executor.execute(query);
 *
 * // Parse the response
 * const result = parseGraphQLResponse(data, 'Article');
 * ```
 *
 * @module graphql
 */

// Types
export type {
  QueryType,
  GraphQLError,
  GraphQLErrorLocation,
  GraphQLRequest,
  GraphQLResponse,
  GraphQLResult,
  AdditionalFields,
} from './types.js';

export { hasGraphQLErrors, hasGraphQLData } from './types.js';

// Query builders
export {
  GetQueryBuilder,
  AggregateQueryBuilder,
  createGetQueryBuilder,
  createAggregateQueryBuilder,
} from './builder.js';

// Search clause builders
export {
  buildNearVectorClause,
  buildNearTextClause,
  buildNearObjectClause,
  buildHybridClause,
  buildBm25Clause,
  buildGroupByClause,
  buildAutocutClause,
} from './search-builder.js';

// Filter serialization
export {
  serializeFilterGraphQL,
  serializeOperator,
  serializeFilterValue,
  buildOperandClause,
} from './filter-builder.js';

// Executor
export type {
  GraphQLTransport,
  GraphQLObservability,
  GraphQLExecutorConfig,
} from './executor.js';

export { GraphQLExecutor, createGraphQLExecutor } from './executor.js';

// Parser
export {
  parseGraphQLResponse,
  parseSearchResult,
  parseSearchHit,
  parseAggregateResult,
  parseObject,
  parseGroupedSearchResult,
} from './parser.js';

// Error handling
export {
  handleGraphQLErrors,
  isRetryableGraphQLError,
  extractErrorDetails,
  formatGraphQLErrors,
} from './error.js';
